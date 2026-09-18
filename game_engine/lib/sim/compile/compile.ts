/**
 * THE SCENARIO COMPILER.
 *
 * A sentence a player typed becomes a playable world. That is the product's
 * pitch, and this is the file that has to earn it without letting the model
 * anywhere near reality.
 *
 * WHAT THE MODEL WRITES, AND WHAT IT DOES NOT
 *
 *   it writes    the title, the premise, who is there, what they want, what
 *                annoys them, what each errand is called, and the numbers on
 *                the price tags
 *   it chooses   from closed lists: which goods, which trades, which info keys
 *   it NEVER     writes a fact key, a mission condition, a phrase in the target
 *                language, a speaker id, a coordinate, or anything the engine
 *                later reads as truth
 *
 * The output is a SKELETON, not a `Scenario`. The skeleton is small, flat and
 * almost all strings — the shape a 27B model can actually hold — and code
 * expands it into the real thing. Every fact key, every `completeWhen`, every
 * ladder rung and every Telugu phrase is written here, by hand, deterministic.
 *
 * So the worst a bad generation can do is produce a dull errand. It cannot
 * produce an unwinnable one, a mission that completes from a grader's opinion,
 * or a shopkeeper who can sell below her floor — because none of those things
 * are expressible in what the model returns.
 */

import { GOODS, goodById } from "./goods";
import { allPhrases, phrasesForErrand, COMPILABLE_LANGUAGES } from "./phrasebank";
import type { Difficulty, FactSpec, MissionNode, Scenario, SimCharacter } from "../schema";
import { SCENARIO_VERSION } from "../schema";
import { bandFor } from "../difficulty";
import { CITIES, getCity } from "../world/cities";
import { sayIn } from "../say";
import { V3_SPEAKERS } from "@/lib/sarvam";

/* ------------------------------------------------------------------ *
 * The closed lists
 * ------------------------------------------------------------------ */

/** Whose counter you can stand at. Each maps to one place and one stall kind. */
export const TRADES = [
  "vegetable_seller",
  "fruit_seller",
  "spice_seller",
  "cloth_seller",
  "bangle_seller",
  "flower_seller",
  "pot_seller",
  "coconut_seller",
  "chai_wallah",
  "plastic_seller",
  "ticket_clerk",
] as const;

export type Trade = (typeof TRADES)[number];

const TRADE_GOOD: Record<Trade, string> = {
  vegetable_seller: "tomato",
  fruit_seller: "mango",
  spice_seller: "masala",
  cloth_seller: "saree",
  bangle_seller: "bangles",
  flower_seller: "garland",
  pot_seller: "tumbler",
  coconut_seller: "coconut",
  chai_wallah: "chai",
  plastic_seller: "bucket",
  ticket_clerk: "ticket",
};

/** The only things anyone can be asked. Each has a checkable answer. */
export const INFO_KEYS = [
  "stall_location",
  "closing_time",
  "platform_number",
  "train_time",
  "best_price_today",
] as const;

export type InfoKey = (typeof INFO_KEYS)[number];

const INFO_LABEL: Record<InfoKey, string> = {
  stall_location: "you know where the other stall is",
  closing_time: "you know when the market shuts",
  platform_number: "you know which platform the train goes from",
  train_time: "you know when the train leaves",
  best_price_today: "you know what the going rate is today",
};

/**
 * Names, from a pool.
 *
 * A model asked for an Indian shopkeeper's name in Telugu script returns
 * something plausible about four times in five, and the fifth is a
 * transliteration, a caste surname nobody would use as a stall name, or a
 * string of boxes. The pool costs nothing and cannot do any of that.
 */
export const NAME_POOL: Record<string, { native: string; gender: "f" | "m" }[]> = {
  "te-IN": [
    { native: "లక్ష్మి", gender: "f" }, { native: "నూర్", gender: "f" },
    { native: "శ్రీనివాస్", gender: "m" }, { native: "పద్మ", gender: "f" },
    { native: "వెంకట్", gender: "m" }, { native: "రమణ", gender: "m" },
    { native: "సరళ", gender: "f" }, { native: "కృష్ణ", gender: "m" },
  ],
  "hi-IN": [
    { native: "लक्ष्मी", gender: "f" }, { native: "नूर", gender: "f" },
    { native: "रमेश", gender: "m" }, { native: "सविता", gender: "f" },
    { native: "विक्रम", gender: "m" }, { native: "सुरेश", gender: "m" },
    { native: "मीना", gender: "f" }, { native: "अनिल", gender: "m" },
  ],
  "ta-IN": [
    { native: "லட்சுமி", gender: "f" }, { native: "நூர்", gender: "f" },
    { native: "முருகன்", gender: "m" }, { native: "கமலா", gender: "f" },
    { native: "செல்வம்", gender: "m" }, { native: "ராஜா", gender: "m" },
    { native: "மாலதி", gender: "f" }, { native: "குமார்", gender: "m" },
  ],
  "kn-IN": [
    { native: "ಲಕ್ಷ್ಮಿ", gender: "f" }, { native: "ನೂರ್", gender: "f" },
    { native: "ಶ್ರೀನಿವಾಸ", gender: "m" }, { native: "ಪದ್ಮ", gender: "f" },
    { native: "ವೆಂಕಟ್", gender: "m" }, { native: "ರಮೇಶ", gender: "m" },
    { native: "ಸರಳಾ", gender: "f" }, { native: "ಕೃಷ್ಣ", gender: "m" },
  ],
  "bn-IN": [
    { native: "লক্ষ্মী", gender: "f" }, { native: "নূর", gender: "f" },
    { native: "রমেশ", gender: "m" }, { native: "সবিতা", gender: "f" },
    { native: "বিক্রম", gender: "m" }, { native: "সুরেশ", gender: "m" },
    { native: "মীনা", gender: "f" }, { native: "অনিল", gender: "m" },
  ],
  "ml-IN": [
    { native: "ലക്ഷ്മി", gender: "f" }, { native: "നൂർ", gender: "f" },
    { native: "രമേശൻ", gender: "m" }, { native: "പദ്മ", gender: "f" },
    { native: "വേണു", gender: "m" }, { native: "സുരേഷ്", gender: "m" },
    { native: "മീന", gender: "f" }, { native: "അനിൽ", gender: "m" },
  ],
  "mr-IN": [
    { native: "लक्ष्मी", gender: "f" }, { native: "नूर", gender: "f" },
    { native: "रमेश", gender: "m" }, { native: "सविता", gender: "f" },
    { native: "विक्रम", gender: "m" }, { native: "सुरेश", gender: "m" },
    { native: "मीना", gender: "f" }, { native: "अनिल", gender: "m" },
  ],
  "gu-IN": [
    { native: "લક્ષ્મી", gender: "f" }, { native: "નૂર", gender: "f" },
    { native: "રમેશ", gender: "m" }, { native: "સવિતા", gender: "f" },
    { native: "વિક્રમ", gender: "m" }, { native: "સુરેશ", gender: "m" },
    { native: "મીના", gender: "f" }, { native: "અનિલ", gender: "m" },
  ],
  "pa-IN": [
    { native: "ਲਕਸ਼ਮੀ", gender: "f" }, { native: "ਨੂਰ", gender: "f" },
    { native: "ਰਮੇਸ਼", gender: "m" }, { native: "ਸਵਿਤਾ", gender: "f" },
    { native: "ਵਿਕਰਮ", gender: "m" }, { native: "ਸੁਰੇਸ਼", gender: "m" },
    { native: "ਮੀਨਾ", gender: "f" }, { native: "ਅਨਿਲ", gender: "m" },
  ],
  "od-IN": [
    { native: "ଲକ୍ଷ୍ମୀ", gender: "f" }, { native: "ନୂର", gender: "f" },
    { native: "ରମେଶ", gender: "m" }, { native: "ସବିତା", gender: "f" },
    { native: "ବିକ୍ରମ", gender: "m" }, { native: "ସୁରେଶ", gender: "m" },
    { native: "ମୀନା", gender: "f" }, { native: "ଅନିଲ", gender: "m" },
  ],
};

const FEMALE_VOICES = ["kavitha", "shreya", "priya", "ritu", "neha", "pooja"];
const MALE_VOICES = ["ratan", "aditya", "rahul", "rohan", "varun", "kabir"];

/* ------------------------------------------------------------------ *
 * The skeleton
 * ------------------------------------------------------------------ */

export type SkeletonCast = {
  id: string;
  trade: Trade;
  gender: "f" | "m";
  /** One line of character, in English. Twelve words or so. */
  quirk: string;
  wants: string;
  provokes: string;
};

export type SkeletonErrand =
  | { kind: "buy"; good: string; qty: number; haggle: boolean; title: string; brief: string }
  | { kind: "ask"; cast: string; info: InfoKey; title: string; brief: string };

export type Skeleton = {
  title: string;
  premise: string;
  cast: SkeletonCast[];
  errands: SkeletonErrand[];
  prices: Record<string, { opening: number; floor: number }>;
};

export type Issue = { path: string; problem: string; severity: "patch" | "repair" | "fatal" };

/* ------------------------------------------------------------------ *
 * The prompt
 * ------------------------------------------------------------------ */

export function compileSystemPrompt(language: string, city: string, difficulty: Difficulty): string {
  const band = bandFor(difficulty);
  return `You design short errands for a language-learning simulation set in ${city}.
The player is learning to speak, badly, out loud, to strangers.

You are given one sentence describing what they want to practise. You return ONE
JSON object describing the errand: who is there, what has to be got done, and
what things cost.

WHAT YOU MAY USE — these lists are closed. Anything outside them is rejected.

TRADES (one per person, never two the same):
${TRADES.join(", ")}

GOODS (a "buy" errand must name one of these):
${GOODS.map((g) => `${g.id} (${g.gloss}, sold by the ${g.unit})`).join("\n")}

INFORMATION (an "ask" errand must name one of these):
${INFO_KEYS.join(", ")}

WHAT YOU MUST NOT DO
- Do not write anything in ${language}. Not one word. The player's lines are
  written by hand elsewhere and yours would break them.
- Do not invent a good, a trade or an information key.
- Do not invent a person's NAME, anywhere, including inside a title or a brief.
  Names are assigned after you write this, so one you make up will contradict
  the one the player sees. Where you would name somebody, write {who} and it
  will be filled in: "Buy a kilo of tomatoes from {who}".
- Do not describe the place, the weather, positions or scenery.

THE SHAPE, and ${band.errands} errands exactly:
{
  "title": "five words, English, what this run is",
  "premise": "two sentences, English, second person, what the player is walking into",
  "cast": [
    {"id":"lowercase_id","trade":"vegetable_seller","gender":"f",
     "quirk":"one line of character, English, under 12 words",
     "wants":"what they want out of this, English",
     "provokes":"what makes them short with you, English"}
  ],
  "errands": [
    {"kind":"buy","good":"tomato","qty":1,"haggle":true,
     "title":"short, English","brief":"one line, English, what to do"},
    {"kind":"ask","cast":"lowercase_id","info":"stall_location",
     "title":"short, English","brief":"one line, English"}
  ],
  "prices": { "tomato": {"opening":40,"floor":32} }
}

RULES ABOUT THE NUMBERS
- Every good in an errand needs an entry in "prices".
- floor is always below opening. For haggle:true, opening is at least 20% above floor.
- Prices are whole rupees and realistic for an Indian street in 2026: vegetables
  30-60 a kilo, a saree 400-900, bangles 150-300, chai 10-20, a train ticket 40-80.
- A ticket_clerk NEVER haggles. If the errand buys a ticket, haggle is false and
  opening equals floor.

At least one errand must be a "buy". Return the JSON object and nothing else.`;
}

export function compileUserPrompt(request: string): string {
  return `The player wrote:

"${request.slice(0, 400)}"

Design their errand.`;
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * Checks the skeleton, and fixes what can be fixed without a round trip.
 *
 * `patch` issues are repaired in place — spending two seconds of a player's
 * life on one out-of-range integer is not a trade worth making. `repair` means
 * go back to the model with a delta. `fatal` means fall back to an authored
 * scenario and say nothing about it.
 *
 * Mutates `spec`. That is deliberate: the patches ARE the return value as much
 * as the issue list is.
 */
export function validateSkeleton(spec: Skeleton, difficulty: Difficulty): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, problem: string, severity: Issue["severity"]) =>
    issues.push({ path, problem, severity });
  const band = bandFor(difficulty);

  if (!spec?.title?.trim()) add("title", "missing", "fatal");
  if (!spec?.premise?.trim()) add("premise", "missing", "fatal");
  if (!Array.isArray(spec?.cast) || !spec.cast.length) add("cast", "no cast", "fatal");
  if (!Array.isArray(spec?.errands) || !spec.errands.length) add("errands", "no errands", "fatal");
  if (issues.some((i) => i.severity === "fatal")) return issues;

  if (spec.premise.length > 400) spec.premise = spec.premise.slice(0, 400);

  // Cast: unique ids, legal trades, no two of the same trade.
  const seenIds = new Set<string>();
  const seenTrades = new Set<string>();
  spec.cast = spec.cast.filter((c, i) => {
    if (!/^[a-z][a-z0-9_]{1,15}$/.test(c.id ?? "")) {
      add(`cast[${i}].id`, `bad id "${c.id}"`, "repair");
      return false;
    }
    if (!(TRADES as readonly string[]).includes(c.trade)) {
      add(`cast[${i}].trade`, `unknown trade "${c.trade}"`, "repair");
      return false;
    }
    if (seenIds.has(c.id) || seenTrades.has(c.trade)) return false;
    seenIds.add(c.id);
    seenTrades.add(c.trade);
    if (c.gender !== "f" && c.gender !== "m") c.gender = "f";
    for (const k of ["quirk", "wants", "provokes"] as const) {
      c[k] = (c[k] ?? "").split(/\s+/).slice(0, 14).join(" ");
    }
    return true;
  });
  if (!spec.cast.length) add("cast", "no usable cast member survived", "repair");

  // Errands: legal kinds, legal targets, a seller for every good.
  spec.errands = spec.errands.filter((e, i) => {
    if (e.kind === "buy") {
      if (!goodById(e.good)) {
        add(`errands[${i}].good`, `unknown good "${e.good}"`, "repair");
        return false;
      }
      if (!spec.cast.some((c) => TRADE_GOOD[c.trade] === e.good)) {
        add(`errands[${i}].good`, `nobody in the cast sells "${e.good}"`, "repair");
        return false;
      }
      e.qty = Math.max(1, Math.min(3, Math.round(Number(e.qty) || 1)));
      if (e.good === "ticket") e.haggle = false;
      return true;
    }
    if (e.kind === "ask") {
      if (!(INFO_KEYS as readonly string[]).includes(e.info)) {
        add(`errands[${i}].info`, `unknown info "${e.info}"`, "repair");
        return false;
      }
      if (!spec.cast.some((c) => c.id === e.cast)) {
        // Cheap to fix and never worth a round trip: ask whoever is there.
        e.cast = spec.cast[0].id;
      }
      return true;
    }
    add(`errands[${i}].kind`, `unknown kind`, "fatal");
    return false;
  });

  if (!spec.errands.some((e) => e.kind === "buy")) {
    add("errands", "no buy errand — nothing costs anything", "repair");
  }
  if (spec.errands.length !== band.errands) {
    // Trimmed silently, topped up by repair. A run with one errand too many is
    // a longer run, not a broken one.
    if (spec.errands.length > band.errands) spec.errands = spec.errands.slice(0, band.errands);
    else add("errands", `${spec.errands.length} errands, wanted ${band.errands}`, "repair");
  }

  // Prices: present, ordered, and with room in them where haggling is required.
  spec.prices = spec.prices ?? {};
  for (const e of spec.errands) {
    if (e.kind !== "buy") continue;
    const p = spec.prices[e.good];
    if (!p || !Number.isFinite(p.opening) || !Number.isFinite(p.floor)) {
      add(`prices.${e.good}`, "missing or not numeric", "repair");
      continue;
    }
    p.opening = Math.max(1, Math.round(p.opening));
    p.floor = Math.max(1, Math.round(p.floor));
    if (e.good === "ticket") {
      p.floor = p.opening;
    } else if (p.floor >= p.opening) {
      p.floor = Math.max(1, Math.round(p.opening * 0.8));
    }
    // A haggle with no room in it is a haggle the player cannot win, and the
    // ladder's middle rung would land on the floor.
    if (e.haggle && p.opening < p.floor * 1.2) p.opening = Math.round(p.floor * 1.25);
  }

  return issues;
}

/* ------------------------------------------------------------------ *
 * Expansion
 * ------------------------------------------------------------------ */

/**
 * Skeleton to `Scenario`. Every fact key and every condition is written here.
 *
 * The archetype is chosen from the trades, not from the model: a cast with a
 * ticket clerk in it is a station, everything else is a bazaar. That is one
 * line, and it is the line that makes "buy a train ticket" land on a platform.
 */
export function expandSkeleton(
  spec: Skeleton,
  opts: { request: string; language: string; cityId: string; difficulty: Difficulty }
): Scenario {
  const city = getCity(opts.cityId) ?? CITIES[0];
  const language = (COMPILABLE_LANGUAGES as readonly string[]).includes(opts.language)
    ? (opts.language as Scenario["language"])
    : ("hi-IN" as Scenario["language"]);
  const band = bandFor(opts.difficulty);
  const names = NAME_POOL[language] ?? NAME_POOL["hi-IN"];

  const archetype: Scenario["archetype"] = spec.cast.some((c) => c.trade === "ticket_clerk")
    ? "station"
    : "bazaar";

  /* ---- cast ---- */
  let fVoice = 0;
  let mVoice = 0;
  const characters: SimCharacter[] = spec.cast.map((c, i) => {
    const pick = names.filter((n) => n.gender === c.gender)[i % 4] ?? names[i % names.length];
    const speaker =
      c.gender === "m" ? MALE_VOICES[mVoice++ % MALE_VOICES.length] : FEMALE_VOICES[fVoice++ % FEMALE_VOICES.length];
    return {
      id: c.id,
      name: pick.native,
      role: c.trade.replace(/_/g, " "),
      speaker: (V3_SPEAKERS as readonly string[]).includes(speaker) ? speaker : "priya",
      colour: [0x1f7a4a, 0x6a2f8a, 0x1b5e9e, 0xb3341f, 0xe0a21c][i % 5],
      locationId: `spot-${c.id}`,
      persona: `${c.quirk} You have done this job a long time and you are not sentimental about it.`,
      knows: [],
      wants: c.wants,
      provokes: c.provokes,
      // Written by code, not the model: an opening line in the wrong script or
      // with a typo is the first thing the player ever hears.
      opening: openingFor(language, c.trade),
    };
  });

  /* ---- facts, missions ---- */
  const facts: FactSpec[] = [];
  const missions: MissionNode[] = [];
  let floorsTotal = 0;

  spec.errands.forEach((e, i) => {
    if (e.kind === "buy") {
      const good = goodById(e.good)!;
      const seller = characters.find((ch) => TRADE_GOOD[spec.cast.find((c) => c.id === ch.id)!.trade] === e.good)!;
      const slot = `S${i + 1}`;
      const price = spec.prices[e.good];
      floorsTotal += price.floor * e.qty;

      facts.push(
        { key: `price.${slot}.${e.good}`, value: price.opening, label: `you ask ₹${price.opening} for ${good.gloss}`, visibility: [seller.id], mutable: false },
        { key: `floor.${slot}.${e.good}`, value: price.floor, label: `you will not go below ₹${price.floor}, and you never say that number out loud`, visibility: [seller.id], mutable: false },
        { key: `rung.${slot}.${e.good}`, value: null, label: `no price has been named for ${good.gloss} yet`, visibility: [seller.id], mutable: true },
        { key: `stock.${slot}.${e.good}`, value: 6, label: `you have plenty of ${good.gloss} left`, visibility: [seller.id], mutable: true },
        { key: `bag.${e.good}`, value: 0, label: `${good.gloss} in your bag`, visibility: "player", mutable: true },
        { key: `deal.${slot}.${e.good}.price`, value: null, label: `what the ${good.gloss} cost`, visibility: "player", mutable: true },
        { key: `bought.${slot}.${e.good}`, value: false, label: `you have the ${good.gloss}`, visibility: "player", mutable: true },
        { key: `beat.${slot}.${e.good}`, value: false, label: `you paid under the asking price`, visibility: "player", mutable: true }
      );
      seller.knows.push(`price.${slot}.${e.good}`, `floor.${slot}.${e.good}`, `rung.${slot}.${e.good}`, `stock.${slot}.${e.good}`);

      missions.push({
        id: `m${i + 1}`,
        title: fillWho(e.title, seller.name),
        brief: fillWho(e.brief, seller.name),
        template: { kind: "buy", slot, item: e.good, qty: e.qty, haggle: !!e.haggle },
        characterId: seller.id,
        preconditions: [],
        completeWhen: [{ kind: "fact", key: `bought.${slot}.${e.good}`, equals: true }],
        failWhen: [{ kind: "clock", afterMinutes: 1120 + band.minutes }],
        effects: [],
        failEffects: [],
        reward: 30,
        keyPhrases: phrasesForErrand(language, "buy").map((p) => p.id),
        parTurns: 5,
        hintAfterTurns: 3,
      });
    } else {
      const teller = characters.find((c) => c.id === e.cast) ?? characters[0];
      const key = `info.${e.info}`;
      if (!facts.some((f) => f.key === key)) {
        // WHAT SHE ACTUALLY SAYS WHEN ASKED.
        //
        // The label is written to the PLAYER — "you know where the other stall
        // is" — and handing that to a shopkeeper tells her nothing she can say
        // out loud. Every compiled world used to stop here, so the character
        // held the key, knew no answer, and `tell` was refused for `dont_know`
        // on every attempt: half the mission templates were unwinnable in every
        // generated world, in every language.
        //
        // The sentence is `say.ts`'s, in the scenario's own language. The one
        // fact inside it is the engine's, and it is what the reply must contain
        // for the errand to settle.
        const about = infoSubject(e.info, characters, teller.id, 1120 + band.minutes, spec);
        facts.push({
          key,
          value: false,
          label: INFO_LABEL[e.info],
          visibility: "all",
          mutable: true,
          answer: sayIn(language).answers[e.info](about),
          answerTokens: [about],
        });
      }
      if (!teller.knows.includes(key)) teller.knows.push(key);

      missions.push({
        id: `m${i + 1}`,
        title: fillWho(e.title, teller.name),
        brief: fillWho(e.brief, teller.name),
        template: { kind: "ask", infoKey: e.info },
        characterId: teller.id,
        preconditions: [],
        completeWhen: [{ kind: "fact", key, equals: true }],
        failWhen: [{ kind: "clock", afterMinutes: 1120 + band.minutes }],
        effects: [],
        failEffects: [],
        reward: 20,
        keyPhrases: phrasesForErrand(language, "ask").map((p) => p.id),
        parTurns: 3,
        hintAfterTurns: 2,
      });
    }
  });

  /* ---- the meta facts every run needs ---- */
  const wallet = Math.max(20, Math.round((floorsTotal * band.walletMargin) / 5) * 5);
  facts.unshift({ key: "wallet", value: wallet, label: `you have ₹${wallet} in your pocket`, visibility: "player", mutable: true });
  for (const c of characters) {
    facts.push(
      { key: `greeted.${c.id}`, value: false, label: `you have greeted them`, visibility: "player", mutable: true },
      { key: `patience.${c.id}`, value: band.patience, label: `they are busy but not annoyed with you`, visibility: [c.id], mutable: true },
      { key: `clarify.${c.id}`, value: 0, label: `times they have had to repeat themselves`, visibility: [c.id], mutable: true },
      { key: `away.${c.id}`, value: false, label: `they have stepped away`, visibility: "all", mutable: true }
    );
    c.knows.push(`patience.${c.id}`, "market.closing");
  }
  facts.push({ key: "market.closing", value: false, label: "the place is starting to shut", visibility: "all", mutable: true });

  return {
    v: SCENARIO_VERSION,
    id: `gen-${Date.now().toString(36)}`,
    title: spec.title,
    sourceRequest: opts.request,
    language,
    languageLabel: city.languageLabel,
    script: city.script,
    difficulty: opts.difficulty,
    archetype,
    city: city.city,
    premise: spec.premise,
    theme: city.theme,
    locations: characters.map((c, i) => ({
      id: `spot-${c.id}`,
      name: c.role,
      pos: [i % 2 === 0 ? -3 : 3, -10 + i * 12] as [number, number],
      radius: 2.6,
    })),
    characters,
    facts,
    phrases: allPhrases(language),
    missions,
    clock: { startMinutes: 1120, rate: 3 },
    stakes: {
      deadlineMinutes: 1120 + band.minutes,
      lastCallMinutes: 1120 + band.minutes - 5,
      assentThreshold: band.assent,
      patience: band.patience,
      patienceGraceTurns: band.patienceGraceTurns,
      cooldownSeconds: 90,
    },
    evaluation: { objectives: spec.errands.map((e) => e.brief) },
  };
}

/**
 * Fills the `{who}` placeholder, and cleans up after a model that ignored it.
 *
 * Measured: asked not to write names, it wrote "Buy one kilo of tomatoes from
 * Ravi" while the cast list said the seller was శ్రీనివాస్. The placeholder is
 * the fix; the trailing-name strip is the backstop, because an instruction is a
 * request and a demo should not depend on one being honoured.
 */
function fillWho(text: string, name: string): string {
  const filled = text.replace(/\{\s*who\s*\}/gi, name);
  // "… from Ravi" / "… from Ravi." with nothing else after it. Only at the end,
  // and only after "from" or "to", so ordinary capitalised words survive.
  return filled.replace(/(from|to)\s+[A-Z][a-z]+\s*\.?$/, (m, prep) => `${prep} ${name}`);
}

/**
 * The one variable thing inside an answer: a name, an hour, a platform, a rate.
 *
 * Read off the world rather than invented, so the sentence she says and the
 * thing the engine checks her reply for are the same string.
 */
function infoSubject(
  info: InfoKey,
  cast: SimCharacter[],
  tellerId: string,
  closesAtMinutes: number,
  spec: Skeleton
): string {
  switch (info) {
    case "stall_location":
      return (cast.find((c) => c.id !== tellerId) ?? cast[0]).name;
    case "closing_time":
    case "train_time":
      // The deadline as a twelve-hour clock hour, which is how anybody in a
      // market says it — "we shut at seven", not "at 1140 minutes".
      return String(((Math.floor(closesAtMinutes / 60) + 11) % 12) + 1);
    case "platform_number":
      // Stable per world rather than random: the answer is a fact, and a fact
      // that changes between two renders of the same scenario is not one.
      return String((spec.errands.length % 6) + 1);
    case "best_price_today": {
      const first = Object.values(spec.prices ?? {})[0] as { opening?: number } | undefined;
      return String(first?.opening ?? 40);
    }
  }
}

/**
 * The first sentence, written by code rather than generated.
 *
 * A generated opening in the wrong script is a world that looks broken before
 * anybody has spoken — and it is worse than that, because it is also the
 * fallback when a model reply fails the script check, so one bad opening
 * becomes every bad turn. They come from `say.ts`, which has all ten languages
 * and is a total map so it cannot quietly miss one again.
 */
function openingFor(language: string, trade: Trade) {
  const pack = sayIn(language);
  return trade === "ticket_clerk" ? pack.openCounter : pack.openStall;
}
