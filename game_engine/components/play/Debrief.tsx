"use client";

/**
 * THE END OF A RUN.
 *
 * Panel order is deliberate and the number is fifth. A person repeats a
 * SENTENCE to a friend; nobody repeats a number. So the story goes first, the
 * evidence second, the arithmetic fourth, and the score — which is the least
 * interesting true thing about a run — near the bottom.
 *
 * THE SECOND PANEL IS THE PRODUCT
 *
 * Each finished errand cites the fact that settled it, and each refusal cites
 * what the shopkeeper tried to do and why the engine would not let her. That is
 * the whole claim of this system, shown rather than asserted, and it is the
 * fifteen seconds worth spending a judge's attention on. It is also the only
 * panel here that could not be faked by a chatbot with a nice UI.
 *
 * THERE IS NO RED
 *
 * The lowest band is "First words". A learner who spent three minutes failing
 * to buy tomatoes in a language they do not speak has done something braver
 * than the score can measure, and a red screen is how you make sure they do not
 * do it again.
 */

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { Scenario, WorldState } from "@/lib/sim/schema";
import { scoreRun, storyOf } from "@/lib/sim/score";
import { breadth } from "@/lib/sim/obstacles";
import type { BaseLangCode } from "@/lib/i18n/base-lang";
import { gloss } from "@/lib/i18n/gloss";
import type { Progress } from "@/lib/sim/learner";

/** Plain-language versions of every reason the engine refuses an act. */
const REFUSAL_GLOSS: Record<string, string> = {
  below_floor: "tried to sell below her lowest price",
  no_money: "tried to hand goods over you could not pay for",
  no_stock: "tried to sell something she had run out of",
  no_assent: "acted as though you had agreed when you had not",
  dont_know: "claimed to tell you something without saying it",
  not_mine: "tried to deal in something she does not sell",
  away: "acted while away from her stall",
  generic: "tried something the world does not allow",
};

export default function Debrief({
  scenario,
  state,
  baseLang,
  progress,
  onClose,
  onAgain,
}: {
  scenario: Scenario;
  state: WorldState;
  baseLang: BaseLangCode;
  /**
   * What has changed since this person started, across every run.
   *
   * Null on the very first render of a session before the ledger has loaded,
   * and null in any context that does not keep one — the panel simply does not
   * show that section, the way it did before there was a ledger at all.
   */
  progress: Progress | null;
  onClose: () => void;
  onAgain: () => void;
}) {
  const score = scoreRun(scenario, state);
  const { produced, cold } = breadth(state);
  const rejections = (state.log ?? []).filter((e) => e.kind === "reject");

  /**
   * THE BEST THING THEY SAID.
   *
   * Their own sentence, back on the screen, with what it was worth. It is the
   * one line in this panel that could not have been written in advance, and
   * since the gate stopped being a phrase list it is usually a sentence nobody
   * authored — which is the whole claim, in the learner's own voice rather than
   * in ours.
   */
  const best = (state.history ?? [])
    .filter((t) => !t.nullTurn && t.said.trim() && typeof t.points === "number")
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];

  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-xl gap-4 border-2 py-5 shadow-shadow">
        {/* 1 — the story */}
        <div className="px-5">
          <p className="font-heading text-xs uppercase tracking-widest text-foreground/50">
            {scenario.title}
          </p>
          <p className="mt-1 text-lg leading-snug">{storyOf(scenario, state, score)}</p>
        </div>

        {/* 2 — the evidence. Build this first; it is the demo. */}
        <div className="px-5">
          <p className="mb-2 font-heading text-[0.65rem] uppercase tracking-widest text-foreground/50">
            What the world recorded
          </p>
          <div className="space-y-1.5">
            {scenario.missions.map((m) => {
              const st = state.missions[m.id];
              const t = m.template;
              const evidence =
                t.kind === "buy"
                  ? state.facts[`bought.${t.slot}.${t.item}`] === true
                    ? `bag.${t.item} = ${state.facts[`bag.${t.item}`]}, paid ₹${state.facts[`deal.${t.slot}.${t.item}.price`]} of an opening ₹${state.facts[`price.${t.slot}.${t.item}`]}`
                    : "never bought"
                  : state.facts[`info.${t.infoKey}`] === true
                    ? `info.${t.infoKey} = true`
                    : "never found out";
              return (
                <div key={m.id} className="flex gap-2 text-sm">
                  <span className={cn("shrink-0", st === "complete" ? "text-green-600" : "text-foreground/30")}>
                    {st === "complete" ? "✓" : st === "failed" ? "—" : "·"}
                  </span>
                  <div className="min-w-0">
                    <span className="font-medium">{m.title}</span>
                    <span className="block font-mono text-[0.7rem] text-foreground/50">{evidence}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {rejections.length > 0 && (
            <div className="mt-3 rounded-md border-2 border-border bg-[#f5c518]/15 px-3 py-2">
              <p className="text-xs font-bold">
                The engine overruled the shopkeeper {rejections.length}{" "}
                {rejections.length === 1 ? "time" : "times"}
              </p>
              <ul className="mt-1 space-y-0.5">
                {rejections.slice(-3).map((r, i) => (
                  <li key={i} className="text-[0.7rem] text-foreground/70">
                    she {REFUSAL_GLOSS[r.text ?? "generic"] ?? REFUSAL_GLOSS.generic} — nothing moved
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 3 — the arithmetic */}
        <div className="px-5">
          <p className="mb-1.5 font-heading text-[0.65rem] uppercase tracking-widest text-foreground/50">
            Your {scenario.languageLabel}
          </p>
          <p className="text-sm leading-relaxed">
            Spoke {scenario.languageLabel} in{" "}
            <strong>
              {score.counts.assentTurns} of {score.counts.productiveTurns}
            </strong>{" "}
            turns
            {score.counts.phrasesHit > 0 && (
              <>
                {" "}
                · sounded like the phrasebook{" "}
                <strong>
                  {score.counts.phrasesHit} of {score.counts.phrasesOffered}
                </strong>{" "}
                times
              </>
            )}
            {score.counts.rupeesSaved > 0 && (
              <>
                {" "}
                · haggled <strong>₹{score.counts.rupeesSaved}</strong> off
              </>
            )}
          </p>
          {produced.length > 0 && (
            <p className="mt-1 text-xs text-foreground/60">
              You did these things with the language: {produced.join(", ").replace(/_/g, " ")}.
            </p>
          )}

          {best && (
            <div className="mt-2 rounded-md border-2 border-border px-3 py-2">
              <p className="font-heading text-[0.6rem] uppercase tracking-widest text-foreground/45">
                The best thing you said
              </p>
              <p className="mt-0.5 text-base leading-snug">{best.said}</p>
              <p className="text-xs text-foreground/55">
                {best.points}% · {gloss(scenario.languageLabel, baseLang)}, out loud, to a stranger
              </p>
            </div>
          )}
        </div>

        {/* 4 — WHAT CHANGED, WHICH IS NOT THE SAME AS HOW IT WENT.
             A score answers "how was that run". Nobody learning a language is
             asking that. They are asking whether they can do something today
             that they could not do last week, and until the ledger survived a
             run there was no way to answer it. */}
        {progress && progress.runs > 1 && (
          <div className="px-5">
            <p className="mb-1.5 font-heading text-[0.65rem] uppercase tracking-widest text-foreground/50">
              Since you started
            </p>
            <div className="rounded-md border-2 border-border px-3 py-2">
              <p className="text-sm">
                <strong>{progress.runs}</strong> runs ·{" "}
                <strong>{progress.turns}</strong> things said out loud in{" "}
                {scenario.languageLabel}
              </p>
              <p className="mt-1 text-sm">
                You can do <strong>{progress.known.length}</strong> of{" "}
                {progress.known.length + progress.cold.length} things with the language:{" "}
                <span className="text-foreground/70">
                  {progress.known.join(", ").replace(/_/g, " ")}
                </span>
              </p>
              {progress.newThisRun.length > 0 && (
                <p className="mt-1 text-sm word-green">
                  New today: {progress.newThisRun.join(", ").replace(/_/g, " ")}
                </p>
              )}
              {progress.cold.length > 0 && (
                <p className="mt-1 text-xs text-foreground/55">
                  Never done yet: {progress.cold.join(", ").replace(/_/g, " ")}. The next run
                  will be built to make you.
                </p>
              )}
              {progress.best && (
                <p className="mt-1 border-t-2 border-border/30 pt-1 text-sm">
                  <span className="font-heading text-[0.6rem] uppercase tracking-widest text-foreground/45">
                    best you have ever said
                  </span>{" "}
                  {progress.best.said}{" "}
                  <span className="text-foreground/50">({progress.best.points}%)</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* 5 — the number */}
        <div className="px-5">
          {score.total === null ? (
            <div className="rounded-md border-2 border-border bg-background px-3 py-3">
              <p className="text-sm font-bold">We could not hear you.</p>
              <p className="mt-1 text-xs text-foreground/60">
                {score.counts.unheardTurns} of {score.counts.turns} turns came back empty, so there
                is no fair score to give. Here is what we did get, above.
              </p>
            </div>
          ) : (
            <div className="flex items-baseline gap-3">
              <span className="font-heading text-4xl font-bold">{score.total}</span>
              <span className="text-lg font-medium">{score.band}</span>
            </div>
          )}
          {score.cappedBy && (
            <p className="mt-1 text-xs italic text-foreground/60">{score.cappedBy}</p>
          )}
        </div>

        {/* 6 — one sentence about what to do next */}
        <div className="px-5">
          <p className="rounded-md border-2 border-dashed border-border px-3 py-2 text-sm">
            {cold.length
              ? `Next time, try ${cold[0].replace(/_/g, " ")} — you have not had to do it yet, and the market will make you.`
              : `You have used every kind of sentence this market asks for. Try ${gloss("Hard", baseLang)}.`}
          </p>
        </div>

        <div className="flex gap-2 px-5">
          <button
            onClick={onAgain}
            className="flex-1 rounded-md border-2 border-border bg-[#f5c518] px-3 py-2 text-sm font-bold"
          >
            Run it again
          </button>
          <button
            onClick={onClose}
            className="rounded-md border-2 border-border px-3 py-2 text-sm"
          >
            Keep walking
          </button>
        </div>
      </Card>
    </div>
  );
}
