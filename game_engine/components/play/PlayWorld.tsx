"use client";

/**
 * The play surface.
 *
 * A situation is chosen, a scenario is tuned to the difficulty band, and the
 * archetype that scenario NAMES is the world that gets built. That last step is
 * the product's whole claim in one line of control flow: "Sunday market" builds
 * a bazaar and "buy a train ticket" builds a platform, from the same engine and
 * the same action layer.
 *
 * The world engine is imported inside the effect: it draws canvas textures and
 * touches `window` at construction, so it must never run in a server render.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { SimHost as SimHostType } from "@/lib/sim/engine/host/SimHost";
import { CITIES } from "@/lib/sim/world/cities";
import { HYDERABAD_BAZAAR } from "@/lib/sim/scenarios/hyderabad-bazaar";
import { HYDERABAD_STATION } from "@/lib/sim/scenarios/hyderabad-station";
import { HANDOFF_KEY } from "./NewScenario";
import type { Scenario } from "@/lib/sim/schema";
import { bindingFor } from "@/lib/sim/compile/bind";
import { tuneScenario } from "@/lib/sim/tune";
import { BANDS, readStoredDifficulty, writeStoredDifficulty } from "@/lib/sim/difficulty";
import {
  historyFor,
  loadProfile,
  progressAfter,
  recordRun,
  saveProfile,
  type LearnerProfile,
  type Progress,
} from "@/lib/sim/learner";
import type { Difficulty } from "@/lib/sim/schema";
import { openingState, type WorldState } from "@/lib/sim/schema";
import { advanceClock, applyMutations, isComplete } from "@/lib/sim/state";
import ErrandPanel from "./ErrandPanel";
import TalkPanel, { type TalkTarget } from "./TalkPanel";
import Debrief from "./Debrief";
import {
  BASE_LANG_OPTIONS,
  readStoredBaseLang,
  writeStoredBaseLang,
  type BaseLangCode,
} from "@/lib/i18n/base-lang";

type Shape = {
  overhead: "sky" | "tarp" | "tin";
  ground: "mud" | "kota" | "asphalt";
  density: "sparse" | "busy" | "packed";
};

type Stats = { calls: number; tris: number; programs: number; ms: number; crowd: number };

/**
 * The scenarios that exist without the compiler.
 *
 * Each names its own `archetype`, so picking a situation picks a place — the
 * whole claim of the product, made concrete with two hand-written entries until
 * the compiler can write a third.
 */
const SCENARIOS = [HYDERABAD_BAZAAR, HYDERABAD_STATION];

/** What both archetype factories accept. Each ignores what it does not use. */
type WorldSpec = {
  title: string;
  theme: Record<string, never> | object;
  language: string;
  shape: Shape;
  /** Scenario people to stand behind stalls, and the kinds they need. */
  cast?: { id: string; name: string; stallKind: string; slot?: string }[];
  requiredStalls?: string[];
};

/**
 * The hand-authored demo scenario, until the compiler exists.
 *
 * Its cast is what makes any of the keepers addressable: an unbound keeper is
 * scenery with no name and no interactable, which is what all twenty-odd of
 * them were until now.
 */


export default function PlayWorld() {
  const mountRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<SimHostType | null>(null);

  const [scenarioId, setScenarioId] = useState("hyderabad-bazaar");
  /**
   * A world the compiler just built, handed over in sessionStorage.
   *
   * The server holds the authoritative copy under the same id — this is only
   * what the browser needs to draw it. If the handover is missing (a reload, a
   * private window) the page falls back to an authored errand rather than
   * showing an empty slab.
   */
  const [compiled, setCompiled] = useState<Scenario | null>(null);
  useEffect(() => {
    let parsed: Scenario | null = null;
    try {
      const raw = sessionStorage.getItem(HANDOFF_KEY);
      if (raw) parsed = JSON.parse(raw) as Scenario;
    } catch {
      /* nothing handed over */
    }
    if (!parsed?.id || !parsed.missions?.length) return;

    setCompiled(parsed);
    setScenarioId(parsed.id);

    // Offer it back to the server before the player tries to speak. If the
    // server still holds it this is a no-op; if it has been through a restart
    // or a deploy since the world was compiled, this is what stops the first
    // turn coming back 404 with a run already in progress.
    void fetch("/api/sim/adopt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: parsed }),
    }).catch(() => {
      /* the turn route will say so plainly if it did not take */
    });
  }, []);
  const [cityId, setCityId] = useState("charminar-lane");
  const [shape, setShape] = useState<Shape>({ overhead: "tarp", ground: "kota", density: "busy" });
  const [stage, setStage] = useState("Starting up");
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [nearby, setNearby] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ calls: 0, tris: 0, programs: 0, ms: 0, crowd: 0 });

  /**
   * The run. Local for now — step 5 moves the authority to the server, and
   * this becomes whatever `/api/sim/turn` last returned.
   */
  const [sim, setSim] = useState<WorldState>(() => openingState(HYDERABAD_BAZAAR, "local"));
  /** Who the player is mid-conversation with, if anyone. */
  const [talking, setTalking] = useState<TalkTarget | null>(null);
  /**
   * The setup panel, folded away by default.
   *
   * Open, it is seven controls down the right-hand third of the screen — which
   * is fine while you are tuning a world and ruinous while you are trying to
   * look at one. The choices it holds are made once at the start of a run and
   * then never again, so the resting state is a chip.
   */
  const [showSetup, setShowSetup] = useState(false);
  /** Shown once the run is over. Dismissable, so the player can keep walking. */
  const [debriefed, setDebriefed] = useState(false);
  const [showDebrief, setShowDebrief] = useState(false);
  /**
   * The language the player READS. Not the one they are learning.
   *
   * Read from the same `sadak.baseLang` key the district game writes, so
   * whatever they picked under "I understand…" on the way in is what they get
   * here. Hydrated in an effect rather than an initialiser because
   * `localStorage` does not exist during the server render.
   */
  const [baseLang, setBaseLang] = useState<BaseLangCode>("en-IN");
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  /**
   * WHAT THIS PERSON CAN ALREADY DO.
   *
   * Hydrated in an effect for the same reason the other two are — there is no
   * `localStorage` during the server render — which means the first paint tunes
   * against an empty profile and the second against the real one. That is fine
   * and deliberate: the run is rebuilt when `run` changes, and a beat of
   * "everything is cold" before the profile lands costs nothing.
   */
  const [profile, setProfile] = useState<LearnerProfile>(() => ({ v: 1, languages: {} }));
  const [learned, setLearned] = useState<Progress | null>(null);
  useEffect(() => {
    setBaseLang(readStoredBaseLang());
    setDifficulty(readStoredDifficulty());
    setProfile(loadProfile());
  }, []);

  /**
   * The run, bent to the band.
   *
   * Recomputed whenever the band changes, which also resets the world state —
   * a wallet and a deadline cannot change under a run in progress without the
   * numbers on screen becoming a lie.
   */
  const base = useMemo(
    () =>
      (compiled?.id === scenarioId ? compiled : null) ??
      SCENARIOS.find((s) => s.id === scenarioId) ??
      SCENARIOS[0],
    [scenarioId, compiled]
  );
  /**
   * THE RUN'S OWN SEED.
   *
   * It was the literal 7, which is a fine number and the wrong idea: the same
   * seed every time means the same obstacle every time, which means the same
   * conversation every time — the exact thing this world was built not to be.
   * Drawn once when the component mounts, so a reload is a new market day and a
   * band change is not.
   *
   * The server is told it on every turn. Both sides must tune identically or
   * the vendor plays an obstacle the hints never mentioned.
   */
  const [seed] = useState(() => Math.floor(Math.random() * 997));
  /**
   * THE ARGUMENT THAT WAS ALWAYS `{}`.
   *
   * `chooseObstacles` was written to read this and pick the obstacles that
   * drill the learner's coldest language functions — "the difference between
   * practice and repetition", as its own docblock puts it. It had never been
   * given anything. Every run started from "this person has never spoken the
   * language", so the hints reset, the obstacles were chosen among functions
   * that were all equally cold, and nothing could say what had changed.
   *
   * It is the ledger now, summed across every run in this language. Second run
   * in a language is measurably not the first.
   */
  const history = useMemo(
    () => historyFor(profile, base.language),
    [profile, base.language]
  );
  const run = useMemo(
    () => tuneScenario(base, difficulty, history, seed),
    [base, difficulty, history, seed]
  );
  const binding = useMemo(() => bindingFor(run.scenario), [run]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let host: SimHostType | null = null;
    let cancelled = false;
    setReady(false);
    setFailed(null);
    setProgress(0);

    (async () => {
      const { SimHost } = await import("@/lib/sim/engine/host/SimHost");
      // Indic faces must be in before any board is painted: fillText does not
      // wait, and a board drawn in a fallback face is a row of boxes forever.
      await import("@/lib/sim/kit/signage").then((m) => m.loadSignFonts());
      // Only the archetype this scenario names is downloaded.
      const make =
        base.archetype === "station"
          ? await import("@/lib/sim/archetypes/station").then(
              (m) =>
                (game: SimHostType, spec: WorldSpec) =>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  new m.Station(game, spec as any)
            )
          : await import("@/lib/sim/archetypes/bazaar").then(
              (m) =>
                (game: SimHostType, spec: WorldSpec) =>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  new m.Bazaar(game, spec as any)
            );
      if (cancelled) return;

      // The scenario names its own city; the select only matters for the
      // authored ones, which is why it is still here.
      const city = CITIES.find((c) => c.city === base.city) ?? CITIES.find((c) => c.id === cityId) ?? CITIES[0];
      host = new SimHost(mount, {
        onProgress: (label: string, fraction: number) => {
          setStage(label);
          setProgress(fraction);
        },
        onLocation: (title: string) => setLocation(title),
        onPrompt: (label: string | null) => setNearby(label),
        onTalk: (character: { id?: string; name?: string }) => {
          if (!character?.id) return;
          setTalking({ id: character.id, name: character.name ?? character.id });
        },
        onStats: setStats,
      });
      hostRef.current = host;

      try {
        await host.mount(
          (game: SimHostType) =>
            make(game, {
              title: `${city.city} · ${city.languageLabel}`,
              theme: city.theme,
              language: base.language,
              shape,
              cast: binding.cast,
              requiredStalls: binding.requiredStalls,
            }),
          { label: `Building ${base.title}` }
        );
      } catch (err) {
        console.error("[sim] lane build failed", err);
        if (!cancelled) setFailed((err as Error).message);
        return;
      }
      if (cancelled) return;

      host.start();
      // A handle to poke at from the console while the world is being built:
      // draw-call breakdowns, crowd counts, teleporting the camera. Set after
      // start, so a strict-mode double mount cannot leave a disposed host here.
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __sim?: SimHostType }).__sim = host;
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
      host?.dispose();
      hostRef.current = null;
    };
  }, [base, cityId, shape, binding]);

  /**
   * The clock, ticking once a second.
   *
   * `advanceClock` settles as it goes, so the seven o'clock deadline actually
   * arrives instead of waiting for some unrelated mutation to happen to run
   * after it. Held until the world is up, so the twenty in-world minutes are
   * not spent on the loading bar.
   */
  // A new band is a new run. Opening state is rebuilt from the tuned scenario
  // and the obstacles get to set their facts before the first turn.
  useEffect(() => {
    const opening = openingState(run.scenario, "local");
    setSim(run.setup.length ? applyMutations(run.scenario, opening, run.setup).state : opening);
    setTalking(null);
    setDebriefed(false);
    setShowDebrief(false);
  }, [run]);

  /**
   * A run ends exactly once.
   *
   * `isComplete` is true when every mission has settled either way, so this
   * fires on the last errand landing or on the seven o'clock deadline taking
   * the last one away. `debriefed` latches so dismissing it does not reopen it
   * on the next clock tick.
   */
  useEffect(() => {
    if (!ready || debriefed) return;
    if (!isComplete(run.scenario, sim)) return;
    setDebriefed(true);
    setShowDebrief(true);
    setTalking(null);

    // THE RUN GOES INTO THE LEDGER, ONCE, HERE.
    //
    // At the debrief rather than per turn, because a reload would double-count
    // it — and rather than on unmount, because a run somebody walked out of
    // halfway is a run that should not count, and that is the correct thing to
    // lose. `progressAfter` reads the profile as it was BEFORE this run, so
    // "you did this for the first time today" means something.
    const language = run.scenario.language;
    setLearned(progressAfter(profile, language, sim));
    const next = recordRun(profile, language, sim);
    setProfile(next);
    saveProfile(next);
  }, [ready, debriefed, run, sim, profile]);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      setSim((prev) => advanceClock(run.scenario, prev, 1).state);
    }, 1000);
    return () => clearInterval(id);
  }, [ready]);

  /**
   * Light the column over whoever is worth walking to.
   *
   * `next` is the first errand still open — the one to do now. Anything else
   * active is `later` and glows faintly, so the lane reads as having somewhere
   * to be rather than as a row of identical beacons.
   */
  useEffect(() => {
    const world = hostRef.current?.activeWorld as { showTargets?: (s: Record<string, string>) => void } | null;
    if (!world?.showTargets) return;

    const states: Record<string, string> = {};
    let first = true;
    for (const m of run.scenario.missions) {
      const st = sim.missions[m.id];
      if (st === "complete") states[m.characterId] ??= "done";
      else if (st === "active") {
        states[m.characterId] = first ? "next" : (states[m.characterId] ?? "later");
        first = false;
      }
    }
    world.showTargets(states);
  }, [sim.missions, ready, run]);

  /**
   * Freeze walking while a conversation is open.
   *
   * `ui.locked` is the flag the host already checks before moving the player,
   * swinging the camera or firing another interaction — so setting it here is
   * enough, and WASD does not carry you away mid-sentence.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.ui.locked = !!talking;
    if (!talking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTalking(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [talking]);

  const setAxis = useCallback(<K extends keyof Shape>(key: K, value: Shape[K]) => {
    setShape((s) => ({ ...s, [key]: value }));
  }, []);

  return (
    // Full viewport, not `100dvh - 4rem`. That 4rem was set aside for a header
    // that turns out to be `fixed` (components/auth/AuthHeader.tsx:55) and so
    // occupies no layout space at all — leaving a 64px band of page background
    // under the canvas. The header floats over the world, which is what it was
    // always doing.
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <div ref={mountRef} className="absolute inset-0 [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full" />

      {!ready && !failed && (
        <div className="absolute inset-0 grid place-items-center bg-background">
          <div className="w-72 text-center">
            <p className="mb-3 text-sm font-medium">{stage}…</p>
            <div className="h-2 w-full overflow-hidden rounded-full border-2 border-border">
              <div
                className="h-full bg-[#f5c518] transition-[width] duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-background p-6">
          <p className="max-w-lg rounded-md border-2 border-red-600 bg-red-50 p-3 text-sm text-red-700">
            The world failed to build: {failed}
          </p>
        </div>
      )}

      {ready && (
        <>
          <ErrandPanel scenario={run.scenario} state={sim} />

          {/* Folded away unless asked for. Everything in here is a before-the-run
              decision, and none of it is worth a third of the viewport while
              somebody is standing in a market trying to see it. */}
          {!showSetup && (
            <button
              onClick={() => setShowSetup(true)}
              className="absolute right-4 top-4 flex items-center gap-1.5 rounded-md border-2 border-border bg-background/95 px-2.5 py-1.5 text-xs font-bold shadow-shadow transition hover:bg-[#f5c518]"
            >
              <span aria-hidden>⚙</span>
              <span className="hidden sm:inline">{base.city} · {base.languageLabel}</span>
              <span className="sm:hidden">Setup</span>
            </button>
          )}

          <div
            className={cn(
              "absolute right-4 top-4 w-56 flex-col gap-2 rounded-md border-2 border-border bg-background/95 p-3 text-xs shadow-shadow",
              showSetup ? "flex" : "hidden"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wide opacity-60">Setup</span>
              <button
                onClick={() => setShowSetup(false)}
                className="rounded border-2 border-border px-1.5 leading-tight hover:bg-[#f5c518]"
                aria-label="Close setup"
              >
                ✕
              </button>
            </div>

            <label className="flex flex-col gap-1">
              <span className="font-bold uppercase tracking-wide opacity-60">City</span>
              <select
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                className="rounded border-2 border-border bg-background px-2 py-1"
              >
                {CITIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.city} · {c.languageLabel}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-bold uppercase tracking-wide opacity-60">Situation</span>
              <select
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value)}
                className="rounded border-2 border-border bg-background px-2 py-1"
              >
                {compiled && (
                  <option value={compiled.id}>{compiled.title} (yours)</option>
                )}
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>

            <Axis
              label="Level"
              value={difficulty}
              options={["beginner", "intermediate", "advanced"]}
              onChange={(v) => {
                setDifficulty(v as Difficulty);
                writeStoredDifficulty(v as Difficulty);
              }}
            />
            <p className="max-w-[13rem] text-[0.65rem] leading-snug opacity-60">
              {BANDS[difficulty].blurb}
            </p>

            <label className="flex flex-col gap-1">
              <span className="font-bold uppercase tracking-wide opacity-60">I understand</span>
              <select
                value={baseLang}
                onChange={(e) => {
                  const code = e.target.value as BaseLangCode;
                  setBaseLang(code);
                  writeStoredBaseLang(code);
                }}
                className="rounded border-2 border-border bg-background px-2 py-1"
              >
                {BASE_LANG_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.native}
                  </option>
                ))}
              </select>
            </label>

            {base.archetype === "bazaar" && (
              <>
            <Axis
              label="Overhead"
              value={shape.overhead}
              options={["tarp", "tin", "sky"]}
              onChange={(v) => setAxis("overhead", v as Shape["overhead"])}
            />
            <Axis
              label="Ground"
              value={shape.ground}
              options={["kota", "mud", "asphalt"]}
              onChange={(v) => setAxis("ground", v as Shape["ground"])}
            />
            <Axis
              label="Density"
              value={shape.density}
              options={["busy", "packed", "sparse"]}
              onChange={(v) => setAxis("density", v as Shape["density"])}
            />
              </>
            )}
          </div>

          {/* The budget, measured rather than guessed — and shown only when the
              setup panel is, because a frame counter in the corner of a demo is
              for whoever is building it, not whoever is watching. */}
          <div className={cn(
            "pointer-events-none absolute bottom-4 right-4 rounded-md border-2 border-border bg-background/90 px-3 py-2 font-mono text-[0.7rem] leading-5",
            showSetup ? "block" : "hidden"
          )}>
            <div>{stats.ms.toFixed(1)} ms · {stats.ms > 0 ? Math.round(1000 / stats.ms) : 0} fps</div>
            <div>{stats.calls} draw calls</div>
            <div>{stats.tris.toLocaleString()} tris</div>
            <div>{stats.programs} programs</div>
            <div>{stats.crowd} people</div>
          </div>

          {showDebrief && (
            <Debrief
              scenario={run.scenario}
              state={sim}
              baseLang={baseLang}
              progress={learned}
              onClose={() => setShowDebrief(false)}
              onAgain={() => {
                const opening = openingState(run.scenario, "local");
                setSim(run.setup.length ? applyMutations(run.scenario, opening, run.setup).state : opening);
                setDebriefed(false);
                setShowDebrief(false);
              }}
            />
          )}

          {talking && !showDebrief && (
            <TalkPanel
              scenario={run.scenario}
              state={sim}
              target={talking}
              baseLang={baseLang}
              seed={seed}
              history={history as Record<string, number>}
              onState={setSim}
              onClose={() => setTalking(null)}
            />
          )}

          {/* The contextual action, in the shipped game's shape: a key cap and
              what pressing it does. It is the only thing on screen that moves,
              which is what makes it read as the next thing to do. */}
          {nearby && !talking && (
            <div className="pointer-events-none absolute bottom-16 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border-2 border-border bg-[#f5c518] px-4 py-2 shadow-shadow">
              <span className="rounded border-2 border-border bg-background px-1.5 py-0.5 font-mono text-xs font-bold">
                E
              </span>
              <p className="text-sm font-bold">{nearby.replace(/\s*\(E\)\s*$/, "")}</p>
            </div>
          )}

          {/* Hidden mid-conversation: it sat directly under the talk panel's
              input, and a hint about walking is the least useful thing on
              screen while somebody is trying to speak Telugu. */}
          {!talking && !showDebrief && (
            <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border-2 border-border bg-background/90 px-3 py-1 text-xs">
              WASD to walk · Shift to run · drag to look · scroll to zoom
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Axis({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-bold uppercase tracking-wide opacity-60">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`rounded border-2 border-border px-2 py-0.5 transition ${
              o === value ? "bg-[#f5c518] font-bold" : "hover:bg-[#f5c518]/40"
            }`}
          >
            {o.replace("_", " ")}
          </button>
        ))}
      </div>
    </div>
  );
}
