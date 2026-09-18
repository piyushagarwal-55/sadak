/**
 * THE CITY A VENUE SITS IN
 *
 * A generated venue is not a building floating on a slab. It is dropped into the
 * chowk of one of SADAK's ten districts — with that district's roads, terraced
 * shopfronts, traffic, trees, landmark and light. All of that already exists and
 * is good; `lib/game/city.ts` builds it from a single `Theme`.
 *
 * So the only thing this file does is choose which city, and hand over its
 * theme. No new art, no new geometry: the bazaar the player walks into is a
 * bazaar in Hyderabad or in Amritsar, and it looks different in each because the
 * district theme already makes it so.
 */

import { SEED_DISTRICTS } from "@/lib/game/districts";
import type { District, Theme } from "@/lib/game/districts";
import type { LangCode } from "@/lib/sarvam";

export type CityChoice = {
  /** District id, so a generated world can be traced back to its source. */
  id: string;
  city: string;
  language: LangCode;
  languageLabel: string;
  script: string;
  theme: Theme;
};

function toChoice(d: District): CityChoice {
  return {
    id: d.id,
    city: d.city,
    language: d.language,
    languageLabel: d.languageLabel,
    script: d.script,
    theme: d.theme,
  };
}

export const CITIES: CityChoice[] = SEED_DISTRICTS.map(toChoice);

export function getCity(id: string): CityChoice | null {
  return CITIES.find((c) => c.id === id) ?? null;
}

/**
 * Picks a city from the request.
 *
 * Both the place and the language are worth matching, because people ask for
 * either: "practise at Hyderabad station" names a city, "Telugu practice at a
 * station" names a language and means the same thing. Anything unmatched falls
 * back to Old Delhi, which is the district with the most written content behind
 * it and the safest thing to show someone who did not express a preference.
 */
export function pickCity(prompt: string): { city: CityChoice; matched: boolean } {
  const text = ` ${prompt.toLowerCase()} `;

  // Common names and spellings that do not appear in the district data itself.
  const aliases: Record<string, string[]> = {
    "purani-sadak": ["delhi", "dilli", "new delhi", "old delhi", "hindi"],
    "marina-nagar": ["chennai", "madras", "tamil"],
    "majestic-cross": ["bengaluru", "bangalore", "blr", "kannada"],
    "park-gully": ["kolkata", "calcutta", "bengali", "bangla"],
    "charminar-lane": ["hyderabad", "telugu", "charminar"],
    "fort-kochi": ["kochi", "cochin", "kerala", "malayalam"],
    "dadar-chowk": ["mumbai", "bombay", "marathi"],
    "manek-chowk": ["ahmedabad", "gujarat", "gujarati"],
    "hall-bazaar": ["amritsar", "punjab", "punjabi"],
    "lingaraj-lane": ["bhubaneswar", "odisha", "odia", "oriya"],
  };

  let best: { city: CityChoice; score: number } | null = null;
  for (const city of CITIES) {
    const terms = [city.city.toLowerCase(), city.languageLabel.toLowerCase(), ...(aliases[city.id] ?? [])];
    for (const term of terms) {
      if (!text.includes(term)) continue;
      // Longer matches win: "bangalore" beats a stray "blr" inside another word.
      const score = term.length;
      if (!best || score > best.score) best = { city, score };
    }
  }

  return best ? { city: best.city, matched: true } : { city: CITIES[0], matched: false };
}
