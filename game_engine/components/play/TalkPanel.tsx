"use client";

/**
 * THE CONVERSATION.
 *
 * You speak. They answer. That is the whole interface, and getting to it meant
 * taking things away twice.
 *
 * WHAT WAS WRONG WITH THE FIRST VERSION
 *
 * It walked a list. Each errand carried five authored phrases, the panel showed
 * them one at a time, and the assent gate only let the world move if what you
 * said matched the one on screen. It was sound — you genuinely could not finish
 * a run in English — and it felt like a form with a microphone attached. Every
 * run was the same five sentences in the same order. So the gate moved (see
 * `assent` in `actions.ts`): the world now opens on two signals that are not a
 * script — the transcript is in the target script, and the model's structured
 * read of what you just did supports the act.
 *
 * WHAT WAS WRONG WITH THE SECOND
 *
 * The gate was free but the screen was not. Two cards: what she said, and the
 * one phrase you were supposed to say back. The number under them was the edit
 * distance to that phrase, computed here in the browser — so a learner who said
 * something perfectly good of their own got eighteen percent, in red. The panel
 * was still teaching the checklist the engine had stopped enforcing, and it
 * still looked like a quiz.
 *
 * WHAT THIS IS
 *
 * A transcript. It accumulates, you can scroll back through it, and it is the
 * only thing on screen that grows — because that is what a conversation looks
 * like and every other shape we tried looked like a form. The score comes down
 * from the server, where the model's read of what you did actually lives
 * (`lib/sim/turnscore.ts`), so saying it your own way is worth what it is
 * worth. The phrase bank is still here, once, small, under the microphone: a
 * phrasebook open on the table, not a prompt you have to hit.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { Scenario, WorldState } from "@/lib/sim/schema";
import { missionFor } from "@/lib/sim/state";
import { useVoice } from "@/lib/useVoice";
import { scoreAttempt, type WordVerdict } from "@/lib/game/speech-score";
import { bandFor } from "@/lib/sim/difficulty";
import { coachFor } from "@/lib/sim/coach";
import { conversationScore } from "@/lib/sim/turnscore";
import type { LastMove } from "@/lib/sim/coach";
import type { LangCode } from "@/lib/sarvam";
import type { BaseLangCode } from "@/lib/i18n/base-lang";
import { gloss } from "@/lib/i18n/gloss";

/**
 * After this many productions of a function, its phrase stops being offered.
 *
 * Comes from the difficulty band, not from here: on Easy the hint stays up
 * almost the whole way, on Hard it is gone after two. That fade is the only
 * form of progress this product claims — not a score going up, but a hint you
 * no longer need.
 */
const DEFAULT_FADE = 4;

/** The bands the score is painted in. GREEN is `speech-score`'s own green. */
const GREEN = 72;
const PARTIAL = 45;

export type TalkTarget = { id: string; name: string };

/** One line of the exchange, in the order it was said. */
type Line =
  | { who: "them"; native: string; roman: string; en?: string; from?: string }
  | { who: "you"; said: string; points: number; label: string };

export default function TalkPanel({
  scenario,
  state,
  target,
  baseLang,
  seed,
  history,
  onState,
  onClose,
}: {
  scenario: Scenario;
  state: WorldState;
  target: TalkTarget;
  /** What the player reads. Not what they are learning. */
  baseLang: BaseLangCode;
  /** The run's seed, so the server plays the obstacles the client showed. */
  seed: number;
  /** This learner's ledger, for the same reason. See the turn route. */
  history: Record<string, number>;
  /** The turn loop is authoritative: whatever it returns replaces the run. */
  onState: (next: WorldState) => void;
  onClose: () => void;
}) {
  const character = scenario.characters.find((c) => c.id === target.id);
  const mission = missionFor(scenario, state, target.id);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  /**
   * What she DID last turn, from the engine rather than from her words.
   *
   * It is the whole input to the coach: "she quoted a price" is what decides
   * that you should be shown a way to push back. Reading it off her reply text
   * would put the suggestion at the mercy of the same model the rest of this
   * architecture keeps away from anything load-bearing.
   *
   * `ok` and the reason travel with it, and they have to: when the engine
   * refuses an act it throws the model's words away and she says a hand-written
   * refusal instead. Passing the verb alone had the card advising "it is done,
   * thank her" directly underneath her saying "what did you say? say it again".
   */
  const [lastAct, setLastAct] = useState<LastMove | null>(null);
  /**
   * THE SUGGESTION THE SHOPKEEPER WROTE FOR YOU.
   *
   * Written in the same model call as her own line, which is what makes the two
   * match, and vetted server-side before it arrives — see `vetCoachLine`. Null
   * until the first turn comes back, and null again whenever the model's
   * suggestion failed a check, in which case the phrase bank underneath it
   * stands in. `coachFor` below is that bank.
   */
  const [written, setWritten] = useState<{
    native: string;
    roman: string;
    en: string;
    because: string;
    live: boolean;
    also: { native: string; gloss: string }[];
  } | null>(null);
  /** Playing the model sentence aloud, so the button can say so. */
  const [demoing, setDemoing] = useState(false);
  /** Where the engine says this exchange is. Null until the first turn lands. */
  const [phase, setPhase] = useState<string | null>(null);
  /**
   * When a turn does not go through.
   *
   * It used to fail in silence: the local score appeared, the reply never did,
   * and the panel looked exactly as it does when the model is slow. A 404 from
   * the turn route — a compiled scenario the server has forgotten — was
   * indistinguishable from a working feature, which is how it survived a
   * reload and a bug report.
   */
  const [failure, setFailure] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const voice = useVoice(scenario.language as LangCode);

  /**
   * WHAT TO SAY BACK, given what she just did.
   *
   * See `lib/sim/coach.ts`. It used to be "the phrase whose function you have
   * produced least", which answers a question nobody was asking: a learner who
   * had just been greeted was shown "hello" again, because greeting was the
   * thing they had done least. Now she greets you and it offers a question; she
   * quotes and it offers a way to push back; she mishears and it offers "say it
   * again". The coldest-function rule survives as the tie-break.
   */
  const bank = coachFor(scenario, state, mission, lastAct);

  /**
   * The model's line when there is one, the bank's when there is not.
   *
   * The bank is still what a first turn shows — nothing has been said yet, so
   * there is nothing for anybody to have written a reply to — and it is still
   * what the alternatives come from, because those are authored and checked.
   */
  const coach = written ?? {
    native: bank.say?.native ?? "",
    roman: bank.say?.roman ?? "",
    en: bank.say?.gloss ?? "",
    because: bank.because,
    live: false,
    also: [] as { native: string; gloss: string }[],
  };
  const aiming = coach.native ? { native: coach.native, roman: coach.roman } : null;

  // The alternatives are the training wheels, and they come off: once this
  // learner has produced a function enough times for the band, the other ways
  // to say it stop being listed. The headline never goes away — "I do not know
  // how to say anything" is the wall this panel exists to take down, and a
  // blank card at the moment somebody is nervous is not a lesson in confidence.
  /**
   * THE FADE COUNTS A LIFETIME, NOT A RUN.
   *
   * It read `state.functions`, which is this run only, so it reset every time
   * somebody started again — a learner on their fortieth run still had training
   * wheels on "hello". The lifetime ledger is what "you no longer need this
   * hint" is actually a claim about. The current run is added on top, because
   * the ten greetings you have just done also count.
   */
  const fadeAfter = bandFor(scenario.difficulty).hintAfter || DEFAULT_FADE;
  const produced = (fn: string) =>
    (history[fn] ?? 0) + (state.functions[fn as keyof typeof state.functions] ?? 0);
  const also = (
    written?.also.length
      ? written.also
      : bank.also
          .filter((p) => produced(p.drills) < fadeAfter)
          .map((p) => ({ native: p.native, gloss: p.gloss }))
  ).slice(0, 2);

  /**
   * NOTHING LEFT TO DO WITH THIS PERSON.
   *
   * Every errand that was hers is settled. It used to be nobody's job to say
   * so: the card went on suggesting the next thing to say, and a player who had
   * finished both errands at a stall had to work out for themselves that they
   * were done and press Esc. She had run out of reasons to talk to them and the
   * screen had not noticed.
   */
  const hers = scenario.missions.filter((m) => m.characterId === target.id);
  /**
   * THE PANEL DOES NOT WORK OUT WHETHER THIS IS OVER. IT IS TOLD.
   *
   * There used to be a reading of the mission table here, beside the engine's
   * own reading in the turn route and the prompt's in `stageOf` — three answers
   * to one question, free to differ. The phase machine is the answer now
   * (`lib/sim/exchange.ts`): the world derives it, the model may propose the
   * last step, the engine applies it, and this renders it.
   *
   * The mission fallback survives for exactly one case: the panel has been open
   * since before the first turn came back, so there is no phase yet.
   */
  // SETTLED is "nothing is owed either way"; DONE is "and she has said goodbye".
  // The way out belongs at the first of those — the errands are finished and
  // the player should be able to leave without waiting for her to release them
  // — and the second only closes it faster.
  const doneHere =
    phase === "SETTLED" ||
    phase === "DONE" ||
    (!phase && !mission && hers.some((m) => state.missions[m.id] === "complete"));
  const closing = doneHere ? conversationScore(state.history ?? [], target.id) : null;

  /**
   * The live per-word verdict, while the mic is down and only then.
   *
   * It is coaching, not marking. The committed score comes from the server and
   * is about what the person in front of you understood; this is about how
   * close your mouth is getting to the sentence on the card, and it has no
   * business surviving the moment you stop speaking.
   */
  const coaching =
    voice.recording && aiming && voice.partial.trim()
      ? scoreAttempt(aiming.native, voice.partial)
      : null;

  const VERDICT: Record<WordVerdict, string> = {
    green: "word-green",
    yellow: "word-yellow",
    red: "word-red",
  };

  /**
   * She says her line out loud when the panel opens.
   *
   * Subtitle first, audio behind it — the text is already on screen by the time
   * Bulbul answers, so a slow voice never holds up the conversation, and a
   * failed one just means a quiet shopkeeper.
   */
  const speak = useCallback(
    async (text: string, asCharacterId?: string, role?: "coach") => {
      if (!character || !text) return;
      // The ring around her portrait means SHE is talking. The coach reading a
      // model sentence is not her, and pulsing her avatar for it would tell the
      // learner the shopkeeper just said the thing they are about to say.
      if (role !== "coach") setSpeaking(true);
      try {
        const res = await fetch("/api/sim/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: asCharacterId ?? character.id,
            text,
            scenarioId: scenario.id,
            role,
          }),
        });
        const { audio } = await res.json();
        if (!audio) return;
        audioRef.current?.pause();
        const el = new Audio(audio);
        audioRef.current = el;
        await new Promise<void>((done) => {
          el.onended = () => done();
          el.onerror = () => done();
          void el.play().catch(() => done());
        });
      } catch {
        /* a silent shopkeeper is better than a stuck one */
      } finally {
        if (role !== "coach") setSpeaking(false);
      }
    },
    [character, scenario.id]
  );

  // Her opening is the transcript's first line, not a card above it — so the
  // conversation starts where it is going to continue.
  useEffect(() => {
    if (!character?.opening?.native) return;
    setLines([
      {
        who: "them",
        native: character.opening.native,
        roman: character.opening.roman,
        en: character.opening.en,
      },
    ]);
    void speak(character.opening.native);
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [
    character?.id,
    character?.opening?.native,
    character?.opening?.roman,
    character?.opening?.en,
    speak,
  ]);

  /**
   * AND THEN IT ENDS ON ITS OWN.
   *
   * Once the summary is up the conversation closes itself, which is what was
   * asked for and is right: an exchange that is over but will not close is the
   * software making the player tidy up after it.
   *
   * The timer restarts on every line, so saying one more thing to her always
   * buys another window rather than racing a clock, and it does not run while
   * she is thinking or while the microphone is down. Cleared on unmount, so
   * leaving early cannot fire a close into a panel that has gone.
   */
  useEffect(() => {
    if (!doneHere || thinking || voice.recording) return;
    // She has actually said goodbye, so there is no reason to keep the panel
    // up waiting for a sentence nobody is going to say.
    const id = setTimeout(onClose, phase === "DONE" ? 2500 : 7000);
    return () => clearTimeout(id);
  }, [doneHere, phase, thinking, voice.recording, lines.length, onClose]);

  // Always looking at the newest line. A transcript you have to scroll to read
  // the end of is a log file.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, thinking]);

  /**
   * One turn.
   *
   * The route is authoritative about everything: what she says, whether the
   * act landed, what the turn was worth, what the world now is. This function's
   * only jobs are to get the player's words to it and to put its answer on the
   * screen.
   */
  const send = useCallback(
    async (text: string, unheard = false) => {
      const line = text.trim();
      if ((!line && !unheard) || !character || thinking) return;
      setThinking(true);
      try {
        const res = await fetch("/api/sim/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId: character.id,
            text: line,
            state,
            difficulty: scenario.difficulty,
            scenarioId: scenario.id,
            seed,
            history,
            input: "voice",
            heard: !unheard,
            baseLang,
          }),
        });
        const json = await res.json();
        if (json.error || !res.ok) {
          setFailure(
            res.status === 404
              ? "This world has expired. Go back and describe it again."
              : (json.error ?? "That turn did not go through.")
          );
          return;
        }
        setFailure(null);
        // Both halves land together, so the transcript never shows a question
        // with nothing under it.
        setLines((prev) => [
          ...prev,
          {
            who: "you",
            said: line || "…",
            points: json.turn?.points ?? 0,
            label: json.turn?.label ?? "",
          },
          ...(json.reply
            ? [
                {
                  who: "them" as const,
                  native: json.reply.native,
                  roman: json.reply.roman,
                  en: json.reply.en,
                },
              ]
            : []),
          // The third voice, on the advanced band. Attributed, because the
          // whole exercise is following a conversation with more than one
          // person in it and an unattributed line would just be confusing.
          ...(json.aside
            ? [
                {
                  who: "them" as const,
                  native: json.aside.native,
                  roman: json.aside.roman,
                  en: json.aside.en,
                  from: json.aside.name,
                },
              ]
            : []),
        ]);
        if (json.phase) setPhase(json.phase);
        if (json.act?.verb) {
          setLastAct({ verb: json.act.verb, ok: !!json.act.ok, reason: json.act.reason ?? null });
        }
        /**
         * "SAY IT AGAIN" MEANS THE CARD STAYS PUT.
         *
         * The plainest bug of the lot, and the player named it exactly: she
         * said "ఏమన్నారు? మళ్ళీ చెప్పండి" — what did you say, say it again — and
         * the card swapped to a different sentence. There is nothing to say
         * again if the thing you were saying has gone.
         *
         * The server sets `repeat` when she asked for a repeat or the engine
         * refused the turn for not following it. The sentence is held; only the
         * reason underneath it and the alternatives change, because those are
         * about the turn that just happened.
         */
        setWritten((prev) => {
          // Held: she asked for a repeat, the engine refused the turn for not
          // following it, or nothing reached the model at all.
          if (json.coach?.repeat && prev?.native) {
            return {
              ...prev,
              because: json.coach.because ?? prev.because,
              also: json.coach.also ?? prev.also,
            };
          }
          if (json.coach?.native) return json.coach;
          // No suggestion came back and there is nothing to hold. Keeping what
          // is on screen beats swapping to the phrase bank mid-attempt.
          return prev ?? null;
        });
        if (json.state) onState(json.state);
        // In order, and in their own voices. Overlapping them would be more
        // realistic and completely unusable.
        if (json.reply) {
          await speak(json.reply.native);
          if (json.aside) void speak(json.aside.native, json.aside.characterId);
        }
      } catch {
        setFailure("Could not reach the server.");
      } finally {
        setThinking(false);
      }
    },
    [character, state, onState, speak, thinking, scenario.id, scenario.difficulty, seed, baseLang, history]
  );

  /**
   * Hear the model sentence before attempting it.
   *
   * The missing half of a speaking exercise: a learner shown "కొంచెం తగ్గించండి"
   * in a script they cannot read, with a romanisation they will mispronounce,
   * has been given a spelling test. In a voice that is nobody in the cast, so
   * the example can never be mistaken for the conversation.
   */
  const demo = useCallback(async () => {
    if (!coach.native || demoing) return;
    setDemoing(true);
    try {
      await speak(coach.native, undefined, "coach");
    } finally {
      setDemoing(false);
    }
  }, [coach.native, demoing, speak]);

  const hold = useCallback(async () => {
    if (voice.recording || thinking) return;
    await voice.start();
  }, [voice, thinking]);

  const release = useCallback(async () => {
    if (!voice.recording) return;
    const transcript = await voice.stop();
    // A tap on the button is not a turn and belongs nowhere — the hook has
    // already told the player to hold it down.
    if (voice.lastIssue() === "short") return;
    // Everything else is. Dropping empty transcripts on the floor is how a
    // learner whose microphone was not working got to the end of a run and was
    // told they had not said anything — the scorer can only refuse to judge a
    // run it could not hear if the turns it could not hear are in the record.
    void send(transcript ?? "", !transcript);
  }, [voice, send]);

  const last = [...lines].reverse().find((l) => l.who === "you") as
    | Extract<Line, { who: "you" }>
    | undefined;

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex justify-center p-4">
      <Card className="w-full max-w-3xl gap-3 border-2 py-4 shadow-shadow">
        {/* Who, and what you are here for. The objective is the shipped game's
            yellow band, and it earns the space: without it a player three turns
            into a haggle has no reminder of what they came to buy. */}
        <div className="flex items-center gap-3 px-4">
          <span
            className={cn(
              "size-8 shrink-0 rounded-full border-2 border-border transition-shadow",
              speaking && "animate-pulse shadow-[0_0_0_4px_rgba(245,197,24,0.45)]"
            )}
            style={{
              background: `#${(character?.colour ?? 0x888888).toString(16).padStart(6, "0")}`,
            }}
            aria-hidden
          />
          <p className="min-w-0 flex-1 truncate text-sm font-bold">
            {character?.name ?? target.name}
            <span className="ml-2 font-normal text-foreground/60">
              {gloss(character?.role ?? "", baseLang)}
            </span>
          </p>
          <span className="shrink-0 rounded border-2 border-border px-1.5 font-mono text-[0.65rem]">
            {state.turns[target.id] ?? 0} {(state.turns[target.id] ?? 0) === 1 ? "turn" : "turns"}
          </span>
          <button
            onClick={onClose}
            className="shrink-0 rounded border-2 border-border px-2 py-0.5 font-mono text-xs hover:bg-[#f5c518]"
          >
            Esc
          </button>
        </div>

        {mission && (
          <div className="mx-4 rounded-md bg-[#f5c518] px-3 py-2">
            <p className="font-heading text-[0.6rem] uppercase tracking-widest opacity-70">
              Objective
            </p>
            <p className="text-sm font-medium">{gloss(mission.brief, baseLang)}</p>
          </div>
        )}

        {/* THE TRANSCRIPT. The only thing on this panel that grows. */}
        <div
          ref={scrollRef}
          className="mx-4 max-h-56 min-h-[7rem] space-y-2 overflow-y-auto rounded-md border-2 border-border px-3 py-2"
        >
          {lines.map((l, i) =>
            l.who === "them" ? (
              <div key={i} className={cn("max-w-[85%]", l.from && "border-l-2 border-border/40 pl-2")}>
                {l.from && (
                  <p className="font-heading text-[0.6rem] uppercase tracking-widest text-foreground/45">
                    {l.from}
                  </p>
                )}
                <p className="text-base leading-snug">{l.native}</p>
                {/* THREE LINES, AND THE THIRD IS THE ONE THAT WAS MISSING.
                    The romanisation is Telugu spelled in Latin letters: it
                    tells you how to say it and nothing about what it means. It
                    was the only subtitle here, so a learner who had told us
                    they read English was reading "Kilo ki ₹40. Meevare enta
                    kaavali?" and guessing. The meaning now comes down with
                    every line, in the language they picked. */}
                <p className="text-xs italic text-foreground/55">{l.roman}</p>
                {l.en && <p className="text-sm text-foreground/70">{gloss(l.en, baseLang)}</p>}
              </div>
            ) : (
              <div key={i} className="ml-auto max-w-[85%] text-right">
                <p className="text-base leading-snug text-foreground/80">{l.said}</p>
                <p
                  className={cn(
                    "text-xs font-medium",
                    l.points >= GREEN
                      ? "word-green"
                      : l.points >= PARTIAL
                        ? "word-yellow"
                        : "word-red"
                  )}
                >
                  {l.points}% · {gloss(l.label, baseLang)}
                </p>
              </div>
            )
          )}
          {thinking && <p className="text-sm italic text-foreground/50">they are thinking…</p>}
        </div>

        {/* SPEAKING ONLY.
            There is no text box. A typed answer is a reading exercise wearing
            a conversation's clothes, and the whole product is the part where
            you have to open your mouth in front of a stranger. The cost is
            real and worth naming: if the microphone fails on stage there is
            no way to play at all. */}
        <div className="flex items-center gap-5 px-4 pt-1">
          <button
            onPointerDown={hold}
            onPointerUp={release}
            onPointerLeave={release}
            disabled={thinking}
            className={cn(
              "flex size-20 shrink-0 items-center justify-center rounded-full border-2 border-border shadow-shadow transition",
              voice.recording
                ? "scale-105 bg-red-500 text-white"
                : "bg-[#f5c518] hover:brightness-95 active:scale-95",
              thinking && "opacity-40"
            )}
            aria-label="Hold to speak"
          >
            <span
              className={cn(
                "block rounded-full bg-current transition-all",
                voice.recording ? "size-7" : "size-6"
              )}
            />
          </button>

          <div className="min-w-0 flex-1">
            {failure ? (
              <p className="font-medium text-red-700">{failure}</p>
            ) : voice.error ? (
              <p className="text-red-700">{voice.error}</p>
            ) : voice.recording && aiming ? (
              // While the mic is down: how close the mouth is getting, word by
              // word, against the phrase on the card. Coaching, not marking.
              <p className="flex flex-wrap gap-1.5 text-lg">
                {aiming.roman
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((w, i) => (
                    <span
                      key={i}
                      className={
                        coaching?.verdicts[i] ? VERDICT[coaching.verdicts[i]] : "text-foreground/50"
                      }
                    >
                      {w}
                    </span>
                  ))}
              </p>
            ) : voice.transcribing ? (
              <p className="text-lg italic text-foreground/50">hearing you…</p>
            ) : last ? (
              <div className="flex items-baseline gap-3">
                <span
                  className={cn(
                    "font-heading text-4xl font-bold",
                    last.points >= GREEN
                      ? "word-green"
                      : last.points >= PARTIAL
                        ? "word-yellow"
                        : "word-red"
                  )}
                >
                  {last.points}%
                </span>
                <span className="text-sm text-foreground/60">{gloss(last.label, baseLang)}</span>
              </div>
            ) : (
              <p className="text-lg text-foreground/40">
                Hold and say it out loud
                <span className="block text-sm">in {scenario.languageLabel}</span>
              </p>
            )}
          </div>
        </div>

        {/* WHAT TO SAY BACK.
            The card a beginner in a market actually needs. It answers the
            question they have right now — she said something, what do I say? —
            rather than the question a syllabus would ask. It is a suggestion
            and never a step: `assent` gates on the language and on what the
            model heard, so saying something else entirely is not worse, and
            nothing here is waiting to be said. */}
        {/* SHE IS DONE WITH YOU, AND THE SCREEN SAYS SO.
            Every errand that was hers is settled, so the card stops suggesting
            things to say and tells the player how it went — their own best
            sentence, back on the screen, and a way out. */}
        {closing ? (
          <div className="mx-4 rounded-md border-2 border-border bg-[#f5c518] px-3 py-2">
            <div className="flex items-baseline gap-3">
              <span className="font-heading text-3xl font-bold">{closing.points}%</span>
              <span className="text-sm font-medium">
                {hers.length > 1 ? "Errands done" : "Errand done"} · {closing.turns}{" "}
                {closing.turns === 1 ? "turn" : "turns"} with {character?.name ?? target.name}
              </span>
            </div>
            {closing.best && (
              <p className="mt-1 border-t-2 border-border/30 pt-1 text-sm">
                <span className="font-heading text-[0.6rem] uppercase tracking-widest opacity-60">
                  your best line
                </span>{" "}
                {closing.best.said}
              </p>
            )}
            <button
              onClick={onClose}
              className="mt-2 w-full rounded-md border-2 border-border bg-background px-3 py-1.5 text-sm font-bold hover:brightness-95"
            >
              Walk on →
            </button>
          </div>
        ) : aiming ? (
          <div className="mx-4 rounded-md border-2 border-border bg-[#f5c518]/15 px-3 py-2">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-heading text-[0.6rem] uppercase tracking-widest text-foreground/45">
                  say this back
                </p>
                <p className="text-xl leading-snug">{coach.native}</p>
                <p className="text-sm italic text-foreground/70">{coach.roman}</p>
                <p className="text-sm text-foreground/60">{gloss(coach.en, baseLang)}</p>
              </div>
              {/* Hearing it is half of learning to say it. In a voice that is
                  nobody in the cast, so the example is never mistaken for the
                  conversation. */}
              <button
                onClick={demo}
                disabled={demoing}
                className={cn(
                  "shrink-0 rounded-md border-2 border-border px-2 py-1 text-xs font-bold",
                  demoing ? "opacity-50" : "bg-background hover:bg-[#f5c518]"
                )}
                aria-label="Hear it"
              >
                {demoing ? "playing…" : "hear it"}
              </button>
            </div>

            {/* Why this one. Without it the card is an oracle, and a learner
                who does not know WHY cannot choose for themselves next time. */}
            <p className="mt-1 border-t-2 border-border/30 pt-1 text-xs text-foreground/55">
              {gloss(coach.because, baseLang)}
            </p>

            {also.length > 0 && (
              <p className="mt-1 text-xs text-foreground/50">
                or:{" "}
                {also.map((p, i) => (
                  <span key={p.native}>
                    {i > 0 && " · "}
                    <span className="text-foreground/75">{p.native}</span>{" "}
                    <span className="italic">{gloss(p.gloss, baseLang)}</span>
                  </span>
                ))}
              </p>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
