"use client";

import { useCallback, useRef, useState } from "react";
import { baseMime, type LangCode } from "@/lib/sarvam";

// How often MediaRecorder hands us a slice while recording. Small enough that
// the player sees words land within about a second of speaking, large enough
// that we aren't hammering /api/stt (and Sarvam's bill) every frame.
const PARTIAL_MS = 900;

/**
 * WHAT "COULDN'T PROCESS THAT AUDIO" ACTUALLY MEANT.
 *
 * Reproduced against the live API: Saaras answers 1500 bytes of silence with
 * `400 Failed to read the file, please check the audio format` — the same
 * message, word for word, that the route was turning into "couldn't process
 * that audio, hold the mic and try again". So the sentence was blaming the
 * format for what was almost always an empty recording: a tap instead of a
 * hold, or a microphone that is selected but not listening.
 *
 * A byte count cannot tell those apart, because a WebM header is over a
 * kilobyte before anybody has said anything. Two honest measurements can:
 *
 *   HELD     how long the button was actually down. Under a third of a second
 *            is a click, not a sentence.
 *   PEAK     the loudest sample the microphone produced, from an AnalyserNode
 *            on the same stream. A working mic in a quiet room still floats
 *            well above this; a muted or wrong device sits at zero.
 *
 * Both are cheap, both run locally, and between them the player gets told what
 * to do instead of being told the audio was malformed.
 */
const MIN_HOLD_MS = 350;
const SILENCE_PEAK = 0.02;

/**
 * The container the recorder produced, without the codecs parameter.
 *
 * `MediaRecorder.mimeType` is "audio/webm;codecs=opus" in Chrome, and that
 * string travels as the Content-Type of the multipart part all the way to
 * Sarvam, who answer `400 Invalid file type` — `audio/webm` is on their list
 * and the parameterised form is not. Being precise about the codec is of no use
 * to anybody here and is enough to fail the request outright.
 */
function recordedType(rec: MediaRecorder): string {
  return baseMime(rec.mimeType) || "audio/webm";
}

/**
 * The first container this browser will actually record, in our order.
 *
 * Opus in WebM is what Saaras is happiest with and what Chrome gives anyway.
 * The empty string at the end is not a fallback value, it is how you tell
 * `MediaRecorder` to choose for itself — passing an unsupported mimeType throws
 * outright, which would turn a codec preference into "microphone access
 * denied".
 */
function preferredMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const wanted = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return wanted.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
}

/**
 * Push-to-talk recording, transcribed by Sarvam Saaras.
 *
 * Recording still starts on hold and the authoritative transcript still comes
 * from a single POST on release — that scoring path is unchanged. What's new
 * is a *live* transcript: MediaRecorder is started with a timeslice, and on
 * every slice we cumulatively re-transcribe everything captured so far
 * (`chunks[0]` carries the WebM header, so `Blob(chunks[0..n])` is always a
 * decodable file on its own) against the same /api/stt route. That result is
 * exposed as `partial` purely for display — it is never scored.
 */
/** Why a recording produced nothing usable, when it was not the network. */
export type VoiceIssue = "short" | "silent" | null;

export function useVoice(language: LangCode) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Guards for the partial stream only — none of this touches the final send.
  const partialInFlightRef = useRef(false);
  const partialSeqRef = useRef(0);
  const partialAppliedSeqRef = useRef(0);
  const partialAbortRef = useRef<AbortController | null>(null);

  // The two measurements, and what they concluded. Held in refs rather than
  // state because `stop()` has to answer its caller in the same tick.
  const heldFromRef = useRef(0);
  const peakRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterRef = useRef<number | null>(null);
  const issueRef = useRef<VoiceIssue>(null);

  /**
   * Watch how loud the microphone is, while it is open.
   *
   * Time-domain samples, not frequency: all this needs to know is whether the
   * needle ever moved. Sampled on an interval rather than an animation frame
   * because it must keep measuring when the tab is not painting.
   */
  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);

      const buf = new Uint8Array(analyser.fftSize);
      meterRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
        peakRef.current = Math.max(peakRef.current, peak);
      }, 100);
    } catch {
      // No meter is not a failure. `peakRef` stays at zero, and `stop()` only
      // trusts it when something was actually measured — see `heardAnything`.
      audioCtxRef.current = null;
    }
  }, []);

  const stopMeter = useCallback(() => {
    if (meterRef.current !== null) window.clearInterval(meterRef.current);
    meterRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setPartial("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      heldFromRef.current = Date.now();
      peakRef.current = 0;
      issueRef.current = null;
      startMeter(stream);
      partialInFlightRef.current = false;
      partialSeqRef.current = 0;
      partialAppliedSeqRef.current = 0;
      partialAbortRef.current = new AbortController();

      // ASK FOR A CONTAINER RATHER THAN TAKING WHAT COMES.
      //
      // `new MediaRecorder(stream)` lets the browser pick, and what it picks
      // varies by browser and by platform — Chrome WebM/Opus, Safari MP4. Both
      // are fine as long as everything downstream agrees about which one it is,
      // and everything downstream used to call it WebM unconditionally. Naming
      // the preference here means the common case is one known container, and
      // `blob.type` carries the truth when it is not.
      const rec = new MediaRecorder(stream, { mimeType: preferredMime() });
      rec.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        chunksRef.current.push(e.data);

        // Natural backpressure: if the previous partial hasn't come back yet,
        // skip this slice rather than queue it. A slow network shouldn't stack
        // up requests that just get superseded seconds later anyway.
        if (partialInFlightRef.current) return;

        const abortController = partialAbortRef.current;
        if (!abortController) return;

        const seq = ++partialSeqRef.current;
        const cumulative = new Blob(chunksRef.current, { type: recordedType(rec) });

        // Mirror the mis-click guard on the final send — a single ~900ms slice
        // of silence isn't worth a round trip.
        if (cumulative.size < 1200) return;

        partialInFlightRef.current = true;
        (async () => {
          try {
            const form = new FormData();
            form.append("audio", cumulative, "speech");
            form.append("language", language);
            form.append("partial", "true");

            const res = await fetch("/api/stt", {
              method: "POST",
              body: form,
              signal: abortController.signal,
            });
            if (!res.ok) return;
            const json = await res.json();
            const text = (json.transcript ?? "").trim();

            // Drop a response that arrived out of order — an older slice's
            // reply landing after a newer one would otherwise rewind the text
            // the player is watching.
            if (seq <= partialAppliedSeqRef.current) return;
            partialAppliedSeqRef.current = seq;
            setPartial(text);
          } catch {
            // Silent by design: a dropped partial is purely cosmetic, and
            // surfacing it would flash an error for something the player
            // never notices (the next slice fixes it 900ms later). Only the
            // final transcription may call setError.
          } finally {
            partialInFlightRef.current = false;
          }
        })();
      };
      rec.start(PARTIAL_MS);

      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setError("Microphone access denied, type instead.");
    }
  }, [language, startMeter]);

  /** Stops recording and resolves with the transcript ("" if nothing usable). */
  const stop = useCallback(async (): Promise<string> => {
    const rec = recorderRef.current;
    if (!rec) return "";

    setRecording(false);

    // Cancel any in-flight partial first — one landing after the final send
    // resolves below could otherwise overwrite `partial` with stale text right
    // as the committed `attempt` takes over from it.
    partialAbortRef.current?.abort();
    partialAbortRef.current = null;

    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: recordedType(rec) }));
      rec.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;

    const held = Date.now() - heldFromRef.current;
    const measured = audioCtxRef.current !== null;
    stopMeter();

    // A CLICK IS NOT A SENTENCE.
    if (held < MIN_HOLD_MS || blob.size < 1200) {
      setPartial("");
      issueRef.current = "short";
      setError("Hold the button down while you speak.");
      return "";
    }

    // THE MICROPHONE NEVER MOVED.
    //
    // Only when a meter actually ran: with no AudioContext the peak is zero for
    // reasons that have nothing to do with the player, and telling somebody
    // their microphone is broken because our meter would not start is worse
    // than saying nothing.
    if (measured && peakRef.current < SILENCE_PEAK) {
      setPartial("");
      issueRef.current = "silent";
      setError("Your microphone is not picking anything up — check it is not muted.");
      return "";
    }

    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "speech");
      form.append("language", language);

      const res = await fetch("/api/stt", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) {
        setError(
          typeof json.error === "string" && json.error.trim()
            ? json.error
            : "Could not transcribe that - try again."
        );
        return "";
      }
      return (json.transcript ?? "").trim();
    } catch {
      setError("Transcription failed.");
      return "";
    } finally {
      setTranscribing(false);
      setPartial("");
    }
  }, [language, stopMeter]);

  /**
   * Why the last attempt produced nothing, read synchronously.
   *
   * A caller has to know whether an empty transcript means "the microphone is
   * not working" — which is a turn, and belongs in the record, because a run
   * nobody could hear is supposed to be unjudgeable — or "you tapped the
   * button", which is not a turn and belongs nowhere.
   */
  const lastIssue = useCallback(() => issueRef.current, []);

  return { recording, transcribing, error, partial, start, stop, setError, lastIssue };
}
