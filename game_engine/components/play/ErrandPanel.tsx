"use client";

/**
 * THE ERRAND PANEL.
 *
 * Deliberately the same vocabulary as the shipped game's HUD — a card of
 * errands top-left, an icon per kind, "kind · person" underneath, a progress
 * ring, a wallet chip — because the two halves of the product should not
 * disagree about what a task looks like.
 *
 * It is rewritten rather than imported because `components/Hud.tsx` is typed
 * against `StreetTask`/`TaskKind`, which belong to the district game. This
 * reads `MissionNode` and `WorldState`, which is the whole point: the card
 * turns green because a fact turned true, and nothing else in this file knows
 * or cares how that happened.
 *
 * WHAT IT DELIBERATELY DOES NOT SHOW
 *
 * No accuracy meter, no patience bar, no score. A number that moves while you
 * are mid-sentence teaches you to watch the number. The one exception is the
 * amber Telugu word on a vendor's chip when their patience is down to one,
 * which is a warning in the language being learnt rather than a gauge.
 */

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { MissionNode, Scenario, WorldState } from "@/lib/sim/schema";
import { clockLabel } from "@/lib/sim/state";

const KIND_ICON: Record<string, string> = { buy: "🛒", ask: "🧭" };

/** Matched to `MARKER_COLOURS`, so the card and the column agree. */
const KIND_COLOUR: Record<string, string> = { buy: "#f5c518", ask: "#3498db" };

function kindLabel(m: MissionNode): string {
  return m.template.kind === "buy" ? "Buy" : "Ask";
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const frac = total ? done / total : 0;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="#4ade80"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`}
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="22" textAnchor="middle" className="fill-current text-[0.6rem] font-bold">
        {done}/{total}
      </text>
    </svg>
  );
}

export default function ErrandPanel({
  scenario,
  state,
}: {
  scenario: Scenario;
  state: WorldState;
}) {
  const visible = scenario.missions.filter((m) => state.missions[m.id] !== "locked");
  const done = scenario.missions.filter((m) => state.missions[m.id] === "complete").length;
  const wallet = Number(state.facts.wallet ?? 0);

  // The closing rush. One line, and only in the last five minutes, because a
  // deadline you are reminded of continuously stops being a deadline.
  const closing = state.clock >= scenario.stakes.lastCallMinutes;

  return (
    <div className="pointer-events-none absolute left-4 top-4 flex w-64 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="rounded-md border-2 border-border bg-[#f5c518] px-2.5 py-1 font-mono text-sm font-bold">
          ₹{wallet}
        </span>
        <span
          className={cn(
            "rounded-md border-2 border-border bg-background px-2.5 py-1 font-mono text-sm",
            closing && "bg-red-100 text-red-700"
          )}
        >
          {clockLabel(state.clock)}
        </span>
        <span className="ml-auto text-foreground">
          <ProgressRing done={done} total={scenario.missions.length} />
        </span>
      </div>

      <Card className="pointer-events-auto gap-2 border-2 py-3 shadow-shadow">
        <div className="px-3">
          <p className="mb-2 font-heading text-xs uppercase tracking-widest text-foreground/60">
            Errands
          </p>
          <div className="space-y-2">
            {visible.map((m) => {
              const st = state.missions[m.id];
              const complete = st === "complete";
              const failed = st === "failed";
              const who = scenario.characters.find((c) => c.id === m.characterId);
              const away = state.facts[`away.${m.characterId}`] === true;
              const annoyed = Number(state.facts[`patience.${m.characterId}`] ?? 9) <= 1;

              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex gap-2",
                    complete && "opacity-50 line-through",
                    failed && "opacity-40"
                  )}
                >
                  <span
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 text-xs"
                    style={{ borderColor: complete ? "#4ade80" : KIND_COLOUR[m.template.kind] }}
                    aria-hidden
                  >
                    {complete ? "✓" : KIND_ICON[m.template.kind]}
                  </span>
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">{m.title}</strong>
                    <em className="text-xs not-italic text-foreground/70">
                      {kindLabel(m)} · {who?.name ?? m.characterId}
                      {/* The entire warning system: one word, in Telugu, once. */}
                      {!complete && annoyed && !away && (
                        <span className="ml-1 font-semibold text-amber-600">విసుగు</span>
                      )}
                      {away && <span className="ml-1 text-foreground/50">— stepped away</span>}
                    </em>
                  </div>
                </div>
              );
            })}
          </div>

          {closing && (
            <p className="mt-2 border-t-2 border-border pt-2 text-xs font-semibold text-red-700">
              The market is shutting.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
