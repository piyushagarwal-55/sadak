import { NextResponse } from "next/server";
import { sarvamSTT, type LangCode } from "@/lib/sarvam";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Substrings in Sarvam STT 400 bodies that mean unreadable / bad audio.
 *
 * "invalid file type" is NOT one of them, deliberately. That one is us sending
 * a Content-Type their allowlist does not contain, which is a bug on this side
 * and has nothing to do with what the player did — dressing it up as "hold the
 * mic and try again" would send them off checking a microphone that was working
 * perfectly. It falls through to the raw message, which is how it was found.
 */
const STT_AUDIO_FORMAT_MARKERS = [
  "failed to read the file",
  "audio format",
] as const;

function sttStatus(err: unknown): number | undefined {
  return (err as { status?: number })?.status;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const audio = form.get("audio");
  const language = form.get("language");
  // Set by useVoice's live-partial requests (900ms MediaRecorder slices) so this
  // handler can skip the retry-with-backoff wrapper for them — see sarvamSTT.
  const partial = form.get("partial") === "true";

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "No audio supplied." }, { status: 400 });
  }

  try {
    const transcript = await sarvamSTT(audio, {
      language: typeof language === "string" ? (language as LangCode) : undefined,
      mode: "transcribe",
      retry: !partial,
    });
    return NextResponse.json({ transcript });
  } catch (err) {
    const status = sttStatus(err);

    // Live partials are display-only. Mid-stream WebM often fails Sarvam's
    // decoder; the next slice (or the final send) is what matters. Soft-fail
    // so the server log stays quiet and the client keeps the last good partial.
    if (partial) {
      return NextResponse.json({ transcript: "" });
    }

    // Logged with the shape of what we sent, because "couldn't process that
    // audio" on its own is unanswerable: the same sentence covers a mis-click,
    // a muted microphone, a container Sarvam will not read and a bad key. The
    // next time somebody asks whether STT is down, this line answers it.
    console.error(
      `stt failed — ${audio.size} bytes, type "${audio.type || "(none)"}", ` +
        `lang ${typeof language === "string" ? language : "(none)"}, status ${status ?? "?"}`,
      err
    );

    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    const formatError =
      status === 400 && STT_AUDIO_FORMAT_MARKERS.some((marker) => msg.includes(marker));

    return NextResponse.json(
      {
        error: formatError
          ? "Couldn't process that audio - hold the mic and try again."
          : err instanceof Error
            ? err.message
            : "Transcription failed.",
      },
      { status: 502 }
    );
  }
}
