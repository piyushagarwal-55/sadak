/**
 * THE WORLD, IN ONE BLOCK, THE SAME FOR EVERYBODY IN IT.
 *
 * This file exists because of a hallucination that was nobody's fault but the
 * architecture's. Asked about tomatoes, Lakshmi said: "Noor is three shops
 * ahead on the right. Get the tomatoes from her. I have absolutely nothing
 * left." Noor sells bangles. Lakshmi had four kilos on the stall and the fact
 * was in her own prompt.
 *
 * She said it because nothing had ever told her what the world was. Her prompt
 * had accumulated, one fix at a time, into four unrelated lists — what she
 * stocks, who she may point at, what information keys she holds, what the
 * answers to those keys are — and not one of them said what anybody ELSE in
 * the lane sells. Given a question that mentioned another trader and a good,
 * she had no way to know the two did not go together, so she joined them up.
 * That is what a model does with a gap.
 *
 * WHAT THIS IS
 *
 * One passage of prose, built from the scenario, identical for every character
 * in it: the place, the cast, what each of them actually has, and the rules
 * that follow from that. It goes at the top of every turn prompt, before the
 * character's own business, so that every person in the market is standing in
 * the same world rather than in their own private fragment of it.
 *
 * IT IS DERIVED, NOT AUTHORED
 *
 * Every line comes off the `Scenario` — which is itself generated when a player
 * describes a situation (`lib/sim/compile/`). Nothing here knows about
 * tomatoes, bangles or Hyderabad. A compiled world about a chemist in Kochi
 * gets the same treatment on the same day it is invented, which is the whole
 * point: the fix is not "tell Lakshmi about Noor", it is "tell everybody what
 * the world is".
 */

import { goodById } from "./compile/goods";
import type { Scenario, SimCharacter } from "./schema";

/** What this character has to sell, from their price keys. */
function sellsOf(scenario: Scenario, c: SimCharacter): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of c.knows) {
    if (!key.startsWith("price.")) continue;
    const item = key.split(".")[2];
    if (!item || seen.has(item)) continue;
    seen.add(item);
    const good = goodById(item);
    out.push(good ? `${good.gloss} (${good.native[scenario.language] ?? item})` : item);
  }
  return out;
}

/** Where they stand, in the words the scenario gave the place. */
function placeOf(scenario: Scenario, c: SimCharacter): string {
  return scenario.locations.find((l) => l.id === c.locationId)?.name ?? "this lane";
}

/**
 * The cast, and the one rule that follows from it.
 *
 * `you` is marked so the character can find themselves in the list. Bystanders
 * are named with what they are, because a person standing in a queue is part of
 * the world and leaving them out is how one of them got mistaken for a shop.
 */
function castBlock(scenario: Scenario, me: string): string {
  const lines = scenario.characters.map((c) => {
    const sells = sellsOf(scenario, c);
    const what = c.bystander
      ? "selling nothing — they are buying too"
      : sells.length
        ? `sells ${sells.join(", ")}`
        : "sells nothing in particular";
    return `- ${c.name}${c.id === me ? " (you)" : ""} — ${c.role}, at ${placeOf(scenario, c)}, ${what}.`;
  });

  return `WHO IS HERE, AND WHAT THEY HAVE
${lines.join("\n")}

Nobody has anything that is not on their own line. You do not send somebody to
another trader for goods that trader does not sell, you do not claim to be out
of something your own stall still has, and you never invent a shop that is not
listed here. If you are asked about something nobody here sells, say you do not
know — that is an ordinary answer and it costs you nothing.`;
}

/** The answers this character holds, as full sentences they can just say. */
function knowledgeBlock(scenario: Scenario, c: SimCharacter): string {
  const held = scenario.facts.filter(
    (f) => f.key.startsWith("info.") && c.knows.includes(f.key) && f.answer
  );
  if (!held.length) {
    return `WHAT YOU KNOW THAT THEY MIGHT ASK
Nothing beyond your own stall. If they ask you where something is, say you do
not know rather than guessing.`;
  }

  return `WHAT YOU KNOW THAT THEY MIGHT ASK
${held.map((f) => `- ${f.key.slice("info.".length)} — say: "${f.answer}"`).join("\n")}
That is the answer, in your own words if you like, but the SUBSTANCE is fixed.
It is the only thing you know beyond your own stall.`;
}

/**
 * The whole brief for one character.
 *
 * Deliberately not memoised. It is a few string joins over a cast of three, and
 * a cache here would be one more thing to be stale when a scenario is
 * recompiled mid-session — which is exactly the kind of bug this file is
 * supposed to be the end of.
 */
export function worldBrief(scenario: Scenario, character: SimCharacter): string {
  // NOT `scenario.premise`. It is written to the PLAYER, in the second person —
  // "You have ₹210, a kilo of tomatoes to buy" — so a character reading it
  // takes the wallet and the shopping list for their own. Worse, the wallet is
  // `visibility: "player"` and `turnUserPrompt` goes to some trouble to keep it
  // out of every prompt in the game; pasting the premise in would have handed
  // it to every vendor in the lane through the back door. The brief is the
  // world. What the customer is carrying and what they came for is theirs.
  return `THE WORLD YOU ARE STANDING IN
${scenario.title}, in ${scenario.city}. Everybody here speaks ${scenario.languageLabel}.

${castBlock(scenario, character.id)}

${knowledgeBlock(scenario, character)}`;
}
