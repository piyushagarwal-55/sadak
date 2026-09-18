/**
 * THE DEMO SCENARIO — Sunday evening at the bazaar, Hyderabad, Telugu.
 *
 * Hand-written, and written before the compiler, for the same reason the Jaipur
 * scenario was: everything downstream gets built against a real target instead
 * of an imagined one. It is also the demo's insurance. Nothing loads this
 * through Groq, so it plays whether or not the compiler behaves on the day.
 *
 * WHAT IT IS FOR
 *
 * Twenty in-world minutes before the market shuts. Two hundred and ten rupees.
 * Two things to buy from two vendors, and the second vendor cannot be found
 * without asking the first where she is. The sums are the design:
 *
 *   Σ asking prices  260   — you cannot pay both openings
 *   Σ floor prices   172   — you can afford both if you haggle
 *   wallet           210
 *
 * So the wallet is not decoration. It is the thing that makes negotiating the
 * only route through, which is the thing the run is teaching. A player who
 * accepts the first number twice runs out of money in front of the bangles.
 *
 * THE CLOCK IS THE ONLY WAY TO FAIL
 *
 * A vendor whose patience runs out walks away and comes back; that is a tax and
 * a cooldown, not a failure. `MissionState` has no path back from `failed`, so
 * a patience failure would strand the graph and the run would have no ending at
 * all. Seven o'clock is the one thing that closes a mission against you.
 */

import { CITIES, getCity } from "../world/cities";
import { SCENARIO_VERSION, type PhraseSpec, type Scenario } from "../schema";

const CITY = getCity("charminar-lane") ?? CITIES[0];

/**
 * The price ladder, computed here and stored as locked facts.
 *
 * Three rungs, and the model never names a number: it chooses `quote`,
 * `concede`, `accept` or `refuse`, and the engine supplies the rupees from
 * whichever rung is current. That is why there is no integer anywhere in the
 * model's per-turn output to validate, and why the haggle can neither collapse
 * to one turn nor fail to terminate.
 */
export function ladderFor(opening: number, floor: number): [number, number, number] {
  return [opening, Math.round((opening + floor) / 2 / 5) * 5, floor];
}

export const TOMATO = { slot: "L1", item: "tomato", opening: 40, floor: 32, qty: 1 };
export const BANGLES = { slot: "R1", item: "bangles", opening: 220, floor: 140, qty: 1 };

const TOMATO_LADDER = ladderFor(TOMATO.opening, TOMATO.floor); // [40, 35, 32]
const BANGLES_LADDER = ladderFor(BANGLES.opening, BANGLES.floor); // [220, 180, 140]

/**
 * The eight phrases this run is scored against.
 *
 * Hand-written, never generated. They are what `scoreAttempt` aligns the
 * player's transcript against, so a wrong one does not merely read badly — it
 * makes a mission uncompletable. Every one needs a native speaker's eyes before
 * the demo, and the `klass` field is what stops a reciter: firing the price
 * question eleven times assents to `ask` forever and never to `close`.
 */
export const PHRASES: PhraseSpec[] = [
  { id: "p_greet", native: "నమస్కారం", roman: "namaskaaram", gloss: "hello", klass: "greet", drills: "greet" },
  { id: "p_price", native: "కిలో ఎంత?", roman: "kilo enta?", gloss: "how much a kilo?", klass: "ask", drills: "ask_price" },
  { id: "p_how_much", native: "ఇది ఎంత?", roman: "idi enta?", gloss: "how much is this?", klass: "ask", drills: "ask_price" },
  { id: "p_reduce", native: "కొంచెం తగ్గించండి", roman: "konchem tagginchandi", gloss: "come down a little", klass: "haggle", drills: "negotiate" },
  { id: "p_too_much", native: "చాలా ఎక్కువ", roman: "chaalaa ekkuva", gloss: "that's too much", klass: "haggle", drills: "refuse" },
  { id: "p_one_kilo", native: "ఒక కిలో ఇవ్వండి", roman: "oka kilo ivvandi", gloss: "give me one kilo", klass: "close", drills: "specify_quantity" },
  { id: "p_agree", native: "సరే, ఇస్తాను", roman: "sare, istaanu", gloss: "alright, I'll take it", klass: "close", drills: "negotiate" },
  { id: "p_where_bangles", native: "గాజుల దుకాణం ఎక్కడ?", roman: "gaajula dukaanam ekkada?", gloss: "where is the bangle shop?", klass: "ask", drills: "ask_location" },

  // Needed only when an obstacle is in the way. They are authored here rather
  // than in `obstacles.ts` because every Telugu string in the product lives
  // with its scenario, where a native speaker can check them in one pass.
  { id: "p_repeat", native: "మళ్ళీ చెప్పండి", roman: "malli cheppandi", gloss: "say it again", klass: "ask", drills: "clarify" },
  { id: "p_slow", native: "మెల్లగా చెప్పండి", roman: "mellagaa cheppandi", gloss: "speak slowly", klass: "ask", drills: "clarify" },
  { id: "p_half_kilo", native: "అర కిలో", roman: "ara kilo", gloss: "half a kilo", klass: "close", drills: "specify_quantity" },
  { id: "p_other_shop", native: "వేరే దుకాణంలో తక్కువ", roman: "vere dukaanamlo takkuva", gloss: "it's cheaper at the other shop", klass: "haggle", drills: "compare" },
  { id: "p_ok_that_one", native: "సరే, అది ఇవ్వండి", roman: "sare, adi ivvandi", gloss: "alright, give me that one", klass: "close", drills: "accept_substitute" },
  { id: "p_where_else", native: "ఇంకెక్కడ దొరుకుతుంది?", roman: "inkekkada dorukutundi?", gloss: "where else can I get it?", klass: "ask", drills: "ask_location" },
  // Not on any errand's list, and it is the most-used sentence in the language.
  // The coach needs something to offer after a sale closes or a question is
  // answered, and "say nothing" is not a lesson.
  { id: "p_thanks", native: "ధన్యవాదాలు అండి, మళ్ళీ వస్తాను.", roman: "dhanyavaadaalu andi, malli vastaanu.", gloss: "thank you, I'll come again", klass: "thank", drills: "thank" },
];

export const HYDERABAD_BAZAAR: Scenario = {
  v: SCENARIO_VERSION,
  id: "hyderabad-bazaar",
  title: "Sunday evening at the bazaar",
  sourceRequest: "Sunday market shopping in Hyderabad — vegetables, and a gift for my mother.",
  language: "te-IN",
  languageLabel: "Telugu",
  script: "Telugu",
  difficulty: "intermediate",
  archetype: "bazaar",
  city: "Hyderabad",
  premise:
    "It is twenty to seven and the market shuts at seven. You have ₹210, a kilo of tomatoes to buy, " +
    "and a set of bangles to find for your mother. Nobody here will switch to English for you.",
  theme: CITY.theme,

  locations: [
    { id: "gali-mouth", name: "The mouth of the gali", pos: [0, -30], radius: 6, arrival: "The lane runs north under the tarps." },
    { id: "veg-stall", name: "Lakshmi's vegetable stall", pos: [-2.6, 2], radius: 2.4 },
    { id: "bangle-stall", name: "Noor's bangle stall", pos: [2.6, 18], radius: 2.4 },
  ],

  characters: [
    {
      id: "lakshmi",
      name: "లక్ష్మి",
      role: "vegetable seller",
      speaker: "kavitha",
      colour: 0x1f7a4a,
      locationId: "veg-stall",
      persona:
        "Lakshmi has sold vegetables in this gali for nineteen years and is packing up. Warm, fast, " +
        "unsentimental about money. She knows every stall in the lane and will tell you where one is " +
        "if you ask her properly. She does not speak English and does not pretend to.",
      knows: [
        "price.L1.tomato",
        "floor.L1.tomato",
        "rung.L1.tomato",
        "stock.L1.tomato",
        "patience.lakshmi",
        "info.bangle_stall_location",
        "market.closing",
      ],
      wants: "To sell the last of the tomatoes and get home.",
      provokes: "Being haggled at before being greeted, or being asked the same thing three times.",
      opening: {
        native: "రండి రండి! టమాటా తాజాగా ఉంది.",
        roman: "Randi randi! Tamaataa taajaagaa undi.",
        en: "Come, come! The tomatoes are fresh.",
      },
    },
    {
      id: "noor",
      name: "నూర్",
      role: "bangle seller",
      speaker: "shreya",
      colour: 0x6a2f8a,
      locationId: "bangle-stall",
      persona:
        "Noor sells glass bangles and knows exactly what they are worth. Quieter than Lakshmi, and " +
        "harder: she opens high because most people walk away and the ones who stay pay. She softens " +
        "for anyone who asks about the colours rather than the price.",
      knows: [
        "price.R1.bangles",
        "floor.R1.bangles",
        "rung.R1.bangles",
        "stock.R1.bangles",
        "patience.noor",
        "market.closing",
      ],
      wants: "To sell a good set at a price she is not ashamed of.",
      provokes: "A first offer far below the asking price, with no conversation first.",
      opening: {
        native: "చూడండి, కొత్త రంగులు వచ్చాయి.",
        roman: "Choodandi, kotta rangulu vacchaayi.",
        en: "Have a look — new colours have come in.",
      },
    },
    {
      // THE WOMAN AHEAD OF YOU IN THE QUEUE.
      //
      // She is not a third vendor and the code makes sure of it: `bystander`
      // keeps her out of `bindingFor`, so she never gets a body to press E on,
      // and the turn route generates her lines through a call whose only return
      // value is a string. She cannot sell, cannot be sold to, and cannot move
      // a rupee — she can only make it harder to get a word in, which is
      // exactly what a real queue does to a learner.
      //
      // She appears on the advanced band only. `tuneScenario` strips the
      // mission's companions below it.
      id: "sarala",
      name: "సరళ",
      role: "another customer, ahead of you in the queue",
      speaker: "roopa",
      colour: 0xb4552a,
      locationId: "veg-stall",
      persona:
        "Sarala buys here twice a week and has somewhere to be. She knows what tomatoes should cost " +
        "and says so out loud, to Lakshmi, in front of you. Not unkind — she will tell you which " +
        "stall is cheaper and then tell you to hurry up. She talks over people the way people do.",
      knows: [],
      wants: "To pay and get on with her evening.",
      provokes: "Dithering.",
      opening: {
        native: "నేను ముందు ఉన్నాను, తొందరగా చెప్పండి.",
        roman: "Nenu mundu unnaanu, tondaragaa cheppandi.",
        en: "I was here first — say what you want, quickly.",
      },
      bystander: true,
    },
  ],

  /**
   * Prices and floors are LOCKED. That is the whole of "the model never
   * controls reality" for the economy: the floor is visible to exactly one
   * character, the action layer refuses an accept below the bottom rung before
   * `applyMutations` is reached, `vet()` refuses any write to a locked fact,
   * and `validateScenario` refuses a scenario that even declares one an effect.
   *
   * Every milestone and meta fact is `visibility: "player"` — shown in the HUD,
   * never handed to an NPC. Marking `bought.*` as `"all"` would pipe the
   * mission's own win condition into every vendor's prompt.
   */
  facts: [
    { key: "wallet", value: 210, label: "you have ₹210 in your pocket", visibility: "player", mutable: true },

    { key: "price.L1.tomato", value: TOMATO_LADDER[0], label: `Lakshmi asks ₹${TOMATO_LADDER[0]} a kilo for tomatoes`, visibility: ["lakshmi"], mutable: false },
    { key: "floor.L1.tomato", value: TOMATO_LADDER[2], label: `Lakshmi will not sell tomatoes below ₹${TOMATO_LADDER[2]} a kilo, and will say so rather than go lower`, visibility: ["lakshmi"], mutable: false },
    { key: "rung.L1.tomato", value: null, label: "no price has been named for the tomatoes yet", visibility: ["lakshmi"], mutable: true },
    { key: "stock.L1.tomato", value: 4, label: "there are about four kilos of tomatoes left", visibility: ["lakshmi"], mutable: true },

    { key: "price.R1.bangles", value: BANGLES_LADDER[0], label: `Noor asks ₹${BANGLES_LADDER[0]} for a set of bangles`, visibility: ["noor"], mutable: false },
    { key: "floor.R1.bangles", value: BANGLES_LADDER[2], label: `Noor will not sell a set below ₹${BANGLES_LADDER[2]}, and will say so rather than go lower`, visibility: ["noor"], mutable: false },
    { key: "rung.R1.bangles", value: null, label: "no price has been named for the bangles yet", visibility: ["noor"], mutable: true },
    { key: "stock.R1.bangles", value: 6, label: "there are six sets of bangles on the board", visibility: ["noor"], mutable: true },

    { key: "bag.tomato", value: 0, label: "kilos of tomatoes in your bag", visibility: "player", mutable: true },
    { key: "bag.bangles", value: 0, label: "sets of bangles in your bag", visibility: "player", mutable: true },
    { key: "deal.L1.tomato.price", value: null, label: "what the tomatoes were settled at", visibility: "player", mutable: true },
    { key: "deal.R1.bangles.price", value: null, label: "what the bangles were settled at", visibility: "player", mutable: true },

    { key: "bought.L1.tomato", value: false, label: "you have bought the tomatoes", visibility: "player", mutable: true },
    { key: "beat.L1.tomato", value: false, label: "you got the tomatoes below the asking price", visibility: "player", mutable: true },
    { key: "bought.R1.bangles", value: false, label: "you have bought the bangles", visibility: "player", mutable: true },
    { key: "beat.R1.bangles", value: false, label: "you got the bangles below the asking price", visibility: "player", mutable: true },

    {
      key: "info.bangle_stall_location",
      value: false,
      label: "you know where the bangle stall is",
      visibility: "all",
      mutable: true,
      // What Lakshmi says when she is asked. The lane runs north from the gali
      // mouth and Noor is up on the right, past the cloth shop.
      answer:
        "\u0c17\u0c3e\u0c1c\u0c41\u0c32 \u0c26\u0c41\u0c15\u0c3e\u0c23\u0c02 \u0c08 \u0c38\u0c02\u0c26\u0c41 \u0c1a\u0c3f\u0c35\u0c30, \u0c15\u0c41\u0c21\u0c3f \u0c35\u0c48\u0c2a\u0c41 \u2014 \u0c28\u0c42\u0c30\u0c4d \u0c26\u0c17\u0c4d\u0c17\u0c30.",
      answerTokens: ["\u0c17\u0c3e\u0c1c\u0c41\u0c32", "\u0c28\u0c42\u0c30\u0c4d"],
    },

    { key: "greeted.lakshmi", value: false, label: "you have greeted Lakshmi", visibility: "player", mutable: true },
    { key: "greeted.noor", value: false, label: "you have greeted Noor", visibility: "player", mutable: true },
    { key: "patience.lakshmi", value: 3, label: "Lakshmi is in a hurry but not yet annoyed with you", visibility: ["lakshmi"], mutable: true },
    { key: "patience.noor", value: 3, label: "Noor is unhurried and not yet annoyed with you", visibility: ["noor"], mutable: true },
    { key: "clarify.lakshmi", value: 0, label: "times Lakshmi has had to repeat herself", visibility: ["lakshmi"], mutable: true },
    { key: "clarify.noor", value: 0, label: "times Noor has had to repeat herself", visibility: ["noor"], mutable: true },
    { key: "away.lakshmi", value: false, label: "Lakshmi has stepped away from her stall", visibility: "all", mutable: true },
    { key: "away.noor", value: false, label: "Noor has stepped away from her stall", visibility: "all", mutable: true },

    { key: "market.closing", value: false, label: "the market is starting to shut for the night", visibility: "all", mutable: true },
  ],

  phrases: PHRASES,

  missions: [
    {
      id: "m1-tomatoes",
      title: "టమాటా — a kilo of tomatoes",
      brief: "Lakshmi asks ₹40 a kilo. See if she comes down.",
      template: { kind: "buy", slot: TOMATO.slot, item: TOMATO.item, qty: TOMATO.qty, haggle: true },
      characterId: "lakshmi",
      preconditions: [],
      // Buying it is the errand. BEATING the price is how well you did it, and
      // it is scored, not required — requiring both was a dead end: a player who
      // accepted at the asking price had spent the money and the stock, `beat`
      // could never become true, and the card stayed active with no way left to
      // win it.
      completeWhen: [{ kind: "fact", key: "bought.L1.tomato", equals: true }],
      failWhen: [{ kind: "clock", afterMinutes: 1140 }],
      effects: [],
      failEffects: [],
      reward: 30,
      keyPhrases: ["p_greet", "p_price", "p_reduce", "p_one_kilo", "p_agree"],
      parTurns: 5,
      hintAfterTurns: 3,
      companions: ["sarala"],
      debriefCriterion:
        "Asked the price before naming a number, countered at least once, and closed below forty.",
    },
    {
      id: "m2-find-bangles",
      title: "Where are the bangles?",
      brief: "Ask Lakshmi where the bangle stall is.",
      template: { kind: "ask", infoKey: "bangle_stall_location" },
      characterId: "lakshmi",
      preconditions: [],
      completeWhen: [{ kind: "fact", key: "info.bangle_stall_location", equals: true }],
      failWhen: [{ kind: "clock", afterMinutes: 1140 }],
      effects: [],
      failEffects: [],
      reward: 20,
      keyPhrases: ["p_where_bangles"],
      parTurns: 2,
      hintAfterTurns: 2,
      debriefCriterion: "Asked where something was, rather than wandering until they found it.",
    },
    {
      id: "m3-bangles",
      title: "గాజులు — a gift for Amma",
      brief: "Noor opens at ₹220. You cannot afford that — talk her down.",
      template: { kind: "buy", slot: BANGLES.slot, item: BANGLES.item, qty: BANGLES.qty, haggle: true },
      characterId: "noor",
      // The graph, not a sequence: you cannot haggle with Noor until you know
      // where she is, and the only way to know is to have asked.
      preconditions: [{ kind: "fact", key: "info.bangle_stall_location", equals: true }],
      completeWhen: [{ kind: "fact", key: "bought.R1.bangles", equals: true }],
      failWhen: [{ kind: "clock", afterMinutes: 1140 }],
      effects: [],
      failEffects: [],
      reward: 40,
      keyPhrases: ["p_greet", "p_how_much", "p_too_much", "p_reduce", "p_agree"],
      parTurns: 6,
      hintAfterTurns: 4,
      debriefCriterion:
        "Opened with something other than a price, countered at least twice, and closed below two hundred and twenty without giving offence.",
    },
  ],

  /** 6:40pm, three in-world minutes per real minute. Twenty minutes to seven. */
  clock: { startMinutes: 1120, rate: 3 },

  stakes: {
    deadlineMinutes: 1140,
    lastCallMinutes: 1135,
    // The one number in this file most likely to be wrong. It gates every
    // mission in the game and has never been measured against real learner
    // Telugu through Saaras.
    assentThreshold: 0.4,
    patience: 3,
    patienceGraceTurns: 3,
    cooldownSeconds: 90,
  },

  evaluation: {
    objectives: [
      "Asked a price in Telugu before naming one",
      "Countered an opening price rather than accepting it",
      "Asked where something was, and understood the answer",
      "Stayed in Telugu when it got difficult, instead of switching to English",
      "Finished both purchases within the wallet and before the market shut",
    ],
  },
};
