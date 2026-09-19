"use client";

/**
 * SAY WHAT YOU WANT TO PRACTISE.
 *
 * One box, a few examples, and a button. Not a chat thread, and that is a
 * decision rather than an omission: a back-and-forth invites the player to
 * negotiate the details of a world they have not seen yet, and every extra turn
 * is another six seconds of a model call before anybody is standing anywhere.
 * One sentence in, one world out, and if it is wrong they change the sentence.
 *
 * The suggestions are load-bearing. "Describe a scenario" in an empty box gets
 * you "something fun", which compiles into nothing in particular. Three
 * concrete examples of the RIGHT SHAPE — an errand, a place, a reason — teach
 * the format in the two seconds before anyone types.
 */

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { CITIES } from "@/lib/sim/world/cities";
import { COMPILABLE_LANGUAGES, isVerified } from "@/lib/sim/compile/phrasebank";
import { BANDS } from "@/lib/sim/difficulty";
import type { Difficulty, Scenario } from "@/lib/sim/schema";

/** Where a compiled scenario waits while the world page loads. */
export const HANDOFF_KEY = "sadak.sim.compiled";

const EXAMPLES = [
  "Sunday market shopping — vegetables, and a gift for my mother",
  "Buy a train ticket to Secunderabad and find the right platform",
  "Get flowers for a temple visit without being overcharged",
];

export default function NewScenario() {
  const router = useRouter();
  const params = useSearchParams();
  // All ten now, because all ten have a phrase bank, a name pool and a font.
  const playable = CITIES.filter((c) => COMPILABLE_LANGUAGES.includes(c.language));

  const [request, setRequest] = useState("");
  // The city was settled on the way here. It is still changeable, because
  // somebody who clicked through from Mumbai and then thought of a Hyderabad
  // errand should not have to go back two pages to say so.
  const [cityId, setCityId] = useState(
    () => params.get("city") ?? playable[0]?.id ?? CITIES[0].id
  );
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  const [building, setBuilding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const city = playable.find((c) => c.id === cityId) ?? playable[0];

  const build = useCallback(async () => {
    const text = request.trim();
    if (!text || building) return;
    setBuilding(true);
    setNote(null);
    try {
      const res = await fetch("/api/sim/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: text, cityId, language: city?.language, difficulty }),
      });
      const json = (await res.json()) as { scenario?: Scenario; generated?: boolean; note?: string; error?: string };
      if (json.error || !json.scenario) {
        setNote(json.error ?? "That did not come out right. Try describing it differently.");
        return;
      }
      // Handed over in sessionStorage rather than a query string: a whole
      // scenario does not fit in a URL, and the server already holds the
      // authoritative copy under this id.
      try {
        sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(json.scenario));
      } catch {
        /* private mode — the world page falls back to an authored errand */
      }
      router.push(`/play?scenario=${encodeURIComponent(json.scenario.id)}`);
    } catch {
      setNote("Could not reach the compiler. Check the dev server.");
    } finally {
      setBuilding(false);
    }
  }, [request, cityId, city, difficulty, building, router]);

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-heading text-3xl font-bold">What do you want to practise?</h1>
        <p className="mt-2 text-foreground/70">
          Describe a situation in one sentence. We build the place, the people and the errand, and you
          walk into it and talk your way through.
        </p>

        <Card className="mt-6 gap-4 border-2 py-5 shadow-shadow">
          <div className="px-5">
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void build();
              }}
              rows={3}
              maxLength={400}
              placeholder="I want to…"
              className="w-full resize-none rounded-md border-2 border-border bg-background px-3 py-2 text-base"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setRequest(ex)}
                  className="rounded-md border-2 border-border px-2 py-1 text-left text-xs hover:bg-[#f5c518]/30"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 px-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-heading text-[0.65rem] uppercase tracking-widest text-foreground/60">
                Where
              </span>
              <select
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                className="rounded-md border-2 border-border bg-background px-3 py-2 text-sm"
              >
                {playable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.city} · {c.languageLabel}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-1">
              <span className="font-heading text-[0.65rem] uppercase tracking-widest text-foreground/60">
                How hard
              </span>
              <div className="flex gap-1">
                {(["beginner", "intermediate", "advanced"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={cn(
                      "flex-1 rounded-md border-2 border-border px-2 py-2 text-xs capitalize transition",
                      d === difficulty ? "bg-[#f5c518] font-bold" : "hover:bg-[#f5c518]/30"
                    )}
                  >
                    {d === "beginner" ? "Easy" : d === "intermediate" ? "Medium" : "Hard"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="px-5 text-xs text-foreground/60">{BANDS[difficulty].blurb}</p>

          <div className="px-5">
            <button
              onClick={build}
              disabled={!request.trim() || building}
              className="w-full rounded-md border-2 border-border bg-[#f5c518] px-4 py-3 font-bold shadow-shadow disabled:opacity-40"
            >
              {building ? "Building your world…" : `Walk into it in ${city?.languageLabel ?? "Hindi"}`}
            </button>
            {note && <p className="mt-2 text-sm text-red-700">{note}</p>}
          </div>
        </Card>

        {city && !isVerified(city.language) && (
          <p className="mt-3 text-xs italic text-foreground/50">
            {city.languageLabel} market phrases have not been checked by a native speaker yet.
            Everything works; a word here or there may be stiffer than it should be.
          </p>
        )}

        <p className="mt-6 text-center text-sm">
          <a href="/play" className="underline">
            or play one we wrote by hand
          </a>
        </p>
      </div>
    </div>
  );
}
