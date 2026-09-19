import { NextResponse } from "next/server";
import { llmJson } from "@/lib/sim/llm";
import {
  compileSystemPrompt,
  compileUserPrompt,
  expandSkeleton,
  validateSkeleton,
  type Skeleton,
} from "@/lib/sim/compile/compile";
import { COMPILABLE_LANGUAGES } from "@/lib/sim/compile/phrasebank";
import { validateScenario, type Difficulty } from "@/lib/sim/schema";
import type { LangCode } from "@/lib/sarvam";
import { CITIES, getCity } from "@/lib/sim/world/cities";
import { SCENARIOS } from "@/lib/sim/scenarios";
import { rememberScenario } from "@/lib/sim/compile/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * A SENTENCE BECOMES A WORLD.
 *
 * The model returns a skeleton — flat, small, almost all English strings — and
 * code expands it into a `Scenario`. Every fact key, every mission condition,
 * every ladder rung and every phrase in the target language is written by the
 * expander, so the worst a bad generation can produce is a dull errand rather
 * than an unwinnable one.
 *
 * THE FAILURE LADDER, AND WHY IT ENDS WHERE IT DOES
 *
 *   patch   fixed in code, no round trip. Spending two seconds of somebody's
 *           life on one out-of-range integer is not a trade worth making.
 *   repair  one delta call naming only the wrong fields.
 *   fatal   fall back to an authored scenario, and say so plainly rather than
 *           showing a spinner that never resolves.
 *
 * The fallback is the point. A hackathon demo cannot afford a grey card at
 * 11:04 on stage, and an authored Hyderabad errand played flawlessly beats a
 * generated one that hangs. The response says which happened, so the UI can be
 * honest without being alarming.
 */

type Body = {
  request?: string;
  language?: string;
  cityId?: string;
  difficulty?: Difficulty;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const request = (body.request ?? "").trim();
  if (!request) return NextResponse.json({ error: "Say what you want to practise." }, { status: 400 });

  const city = getCity(body.cityId ?? "") ?? CITIES[0];
  // The gate sits here, not at render time. Eight of the eleven `LangCode`s
  // have no phrase bank, no shop names and no font — a Kannada errand would
  // render on Devanagari boards with phrases nobody could be scored against.
  const asked = body.language as LangCode | undefined;
  const language: LangCode =
    asked && COMPILABLE_LANGUAGES.includes(asked)
      ? asked
      : COMPILABLE_LANGUAGES.includes(city.language)
        ? city.language
        : "hi-IN";
  const difficulty: Difficulty = body.difficulty ?? "intermediate";

  const fallback = () =>
    NextResponse.json({
      scenario: SCENARIOS[0],
      generated: false,
      note: "We could not build that one. Here is an errand we wrote by hand.",
    });

  const skeleton = await llmJson<Skeleton>(
    [
      { role: "system", content: compileSystemPrompt(language, city.city, difficulty) },
      { role: "user", content: compileUserPrompt(request) },
    ],
    { maxTokens: 1200, temperature: 0.4 }
  );

  // `llmJson` swallows a parse failure and returns null by design. There is
  // nothing to repair in unparseable output, so this goes straight to the
  // fallback rather than spending another six seconds finding that out.
  if (!skeleton) return fallback();

  const issues = validateSkeleton(skeleton, difficulty);
  if (issues.some((i) => i.severity === "fatal")) return fallback();

  // One repair call, with the system message byte-identical so the whole
  // prompt prefix stays cached, and only the wrong fields named.
  const needsRepair = issues.filter((i) => i.severity === "repair");
  let spec = skeleton;
  if (needsRepair.length) {
    const repaired = await llmJson<Skeleton>(
      [
        { role: "system", content: compileSystemPrompt(language, city.city, difficulty) },
        {
          role: "user",
          content:
            `${compileUserPrompt(request)}\n\nYou returned this:\n${JSON.stringify(skeleton)}\n\n` +
            `These fields are wrong:\n${needsRepair.map((i) => `- ${i.path}: ${i.problem}`).join("\n")}\n\n` +
            `Return the SAME object with ONLY those fields corrected.`,
        },
      ],
      { maxTokens: 1200, temperature: 0.2 }
    );
    if (repaired) {
      const again = validateSkeleton(repaired, difficulty);
      if (!again.some((i) => i.severity !== "patch")) spec = repaired;
    }
  }

  const scenario = expandSkeleton(spec, { request, language, cityId: city.id, difficulty });

  // The last gate, and the only one that matters: whatever came back, the
  // expanded scenario must pass exactly the same validator the hand-written
  // ones do. If it does not, the compiler is wrong and the player should not
  // find that out by playing it.
  const problems = validateScenario(scenario);
  if (problems.length) {
    console.warn("[sim] compiled scenario failed validation:", problems.slice(0, 5));
    return fallback();
  }

  // Kept server-side and handed back by id. The browser never gets to be the
  // authority on what a floor price is.
  rememberScenario(scenario);
  return NextResponse.json({ scenario, generated: true });
}
