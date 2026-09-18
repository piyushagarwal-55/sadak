/**
 * THE SECOND SCENARIO — a ticket to Secunderabad, Hyderabad, Telugu.
 *
 * It exists to prove the thing the bazaar cannot prove on its own: that the
 * situation the player asked for lands in a PLACE SHAPED LIKE THAT SITUATION.
 * Everything downstream of `Scenario` is identical — the same action layer, the
 * same assent gate, the same scorer — and the only line that differs is
 * `archetype: "station"`.
 *
 * WHY THIS ERRAND AND NOT ANOTHER
 *
 * A ticket counter is the opposite of a bazaar stall in the one way that
 * matters to a learner. There is no haggling: the fare is the fare, and the
 * whole conversation is about being UNDERSTOOD — naming a destination, saying
 * how many, hearing a platform number back and getting it right. So it drills
 * the functions the market cannot: `specify_quantity` against a real count,
 * `clarify` against a number you must repeat back, `ask_location` against an
 * answer that is genuinely unknown rather than decorative.
 *
 * It is also the errand with the most real-world consequence in it. Mishear the
 * platform and you are on the wrong train, which is a thing that happens to
 * people who are learning, and a thing no flashcard has ever prepared anyone
 * for.
 */

import { CITIES, getCity } from "../world/cities";
import { SCENARIO_VERSION, type PhraseSpec, type Scenario } from "../schema";

const CITY = getCity("charminar-lane") ?? CITIES[0];

export const TICKET = { slot: "C1", item: "ticket", opening: 60, floor: 60, qty: 2 };

/**
 * The fare does not move.
 *
 * Both rungs sit at ₹60, so `concede` is refused at the first attempt and the
 * clerk holds — which is exactly right. A ticket counter that haggled would be
 * teaching a habit that gets a learner laughed at, and the ladder machinery
 * expresses "this price is fixed" without needing a second mechanism.
 */
export const PHRASES: PhraseSpec[] = [
  { id: "s_greet", native: "నమస్కారం", roman: "namaskaaram", gloss: "hello", klass: "greet", drills: "greet" },
  { id: "s_where", native: "సికింద్రాబాద్ కి ఒక టికెట్", roman: "Sikindraabaad ki oka ticket", gloss: "one ticket to Secunderabad", klass: "close", drills: "specify_quantity" },
  { id: "s_two", native: "రెండు టికెట్లు", roman: "rendu ticketlu", gloss: "two tickets", klass: "close", drills: "specify_quantity" },
  { id: "s_fare", native: "ఎంత అవుతుంది?", roman: "enta avutundi?", gloss: "how much will it be?", klass: "ask", drills: "ask_price" },
  { id: "s_platform", native: "ఏ ప్లాట్‌ఫారం?", roman: "ae platform?", gloss: "which platform?", klass: "ask", drills: "ask_location" },
  { id: "s_when", native: "రైలు ఎప్పుడు?", roman: "railu eppudu?", gloss: "when is the train?", klass: "ask", drills: "ask_location" },
  { id: "s_repeat", native: "మళ్ళీ చెప్పండి", roman: "malli cheppandi", gloss: "say it again", klass: "ask", drills: "clarify" },
  { id: "s_thanks", native: "ధన్యవాదాలు", roman: "dhanyavaadaalu", gloss: "thank you", klass: "thank", drills: "thank" },
];

export const HYDERABAD_STATION: Scenario = {
  v: SCENARIO_VERSION,
  id: "hyderabad-station",
  title: "The 7:10 to Secunderabad",
  sourceRequest: "I want to practise buying a train ticket in Telugu.",
  language: "te-IN",
  languageLabel: "Telugu",
  script: "Telugu",
  difficulty: "intermediate",
  archetype: "station",
  city: "Hyderabad",
  premise:
    "Two tickets to Secunderabad, and the train goes at ten past. The clerk will not repeat himself " +
    "twice, the fare is fixed, and you still do not know which platform it leaves from.",
  theme: CITY.theme,

  locations: [
    { id: "platform-south", name: "The south end of the platform", pos: [1.5, -41], radius: 6, arrival: "Platform one. The board is too far away to read." },
    { id: "counter", name: "The ticket counter", pos: [6, 0], radius: 2.6 },
  ],

  characters: [
    {
      id: "srinivas",
      name: "శ్రీనివాస్",
      role: "ticket clerk",
      speaker: "ratan",
      colour: 0x1b5e9e,
      locationId: "counter",
      persona:
        "Srinivas has sold tickets at this window for twenty-two years and there is a queue behind you. " +
        "Not unkind, but fast and completely uninterested in small talk: he wants the destination, the " +
        "number of tickets, and the money, in that order. He will tell you the platform if you ask. He " +
        "will not ask you whether you understood.",
      knows: [
        "price.C1.ticket",
        "floor.C1.ticket",
        "rung.C1.ticket",
        "stock.C1.ticket",
        "patience.srinivas",
        "info.platform_number",
        "info.train_time",
        "market.closing",
      ],
      wants: "To clear the queue behind you before the 7:10 goes.",
      provokes: "Being asked to repeat something a third time, or being haggled at over a fixed fare.",
      opening: {
        native: "ఎక్కడికి?",
        roman: "Ekkadiki?",
        en: "Where to?",
      },
    },
  ],

  facts: [
    { key: "wallet", value: 150, label: "you have ₹150 in your pocket", visibility: "player", mutable: true },

    // Both rungs on the floor: this is a government counter, not a stall.
    { key: "price.C1.ticket", value: 60, label: "a ticket to Secunderabad is ₹60, and the fare is fixed", visibility: ["srinivas"], mutable: false },
    { key: "floor.C1.ticket", value: 60, label: "the fare is fixed by the railway and you cannot change it for anybody", visibility: ["srinivas"], mutable: false },
    { key: "rung.C1.ticket", value: null, label: "you have not told them the fare yet", visibility: ["srinivas"], mutable: true },
    { key: "stock.C1.ticket", value: 40, label: "there are plenty of seats left on the 7:10", visibility: ["srinivas"], mutable: true },

    { key: "bag.ticket", value: 0, label: "tickets in your hand", visibility: "player", mutable: true },
    { key: "deal.C1.ticket.price", value: null, label: "what the tickets cost", visibility: "player", mutable: true },
    { key: "bought.C1.ticket", value: false, label: "you have the tickets", visibility: "player", mutable: true },
    { key: "beat.C1.ticket", value: false, label: "you paid under the asking price", visibility: "player", mutable: true },

    { key: "info.platform_number", value: false, label: "the 7:10 to Secunderabad goes from platform 3", visibility: "all", mutable: true },
    { key: "info.train_time", value: false, label: "the train to Secunderabad leaves at 7:10", visibility: "all", mutable: true },

    { key: "greeted.srinivas", value: false, label: "you have greeted him", visibility: "player", mutable: true },
    { key: "patience.srinivas", value: 3, label: "there is a queue behind you but he is not annoyed yet", visibility: ["srinivas"], mutable: true },
    { key: "clarify.srinivas", value: 0, label: "times he has had to repeat himself", visibility: ["srinivas"], mutable: true },
    { key: "away.srinivas", value: false, label: "he has stepped away from the window", visibility: "all", mutable: true },
    { key: "market.closing", value: false, label: "the last announcement for the 7:10 has gone out", visibility: "all", mutable: true },
  ],

  phrases: PHRASES,

  missions: [
    {
      id: "s1-tickets",
      title: "రెండు టికెట్లు — two tickets",
      brief: "Two tickets to Secunderabad. The fare is ₹60 each and it does not move.",
      template: { kind: "buy", slot: TICKET.slot, item: TICKET.item, qty: TICKET.qty, haggle: false },
      characterId: "srinivas",
      preconditions: [],
      completeWhen: [{ kind: "fact", key: "bought.C1.ticket", equals: true }],
      failWhen: [{ kind: "clock", afterMinutes: 1150 }],
      effects: [],
      failEffects: [],
      reward: 40,
      keyPhrases: ["s_greet", "s_where", "s_two", "s_fare", "s_repeat"],
      parTurns: 5,
      hintAfterTurns: 3,
      debriefCriterion: "Named the destination and the number without being asked twice.",
    },
    {
      id: "s2-platform",
      title: "Which platform?",
      brief: "You have the tickets. Now find out where the train actually goes from.",
      template: { kind: "ask", infoKey: "platform_number" },
      characterId: "srinivas",
      // No precondition. Gating this behind the purchase looked tidy and played
      // badly: "which platform?" is the first thing anyone asks, the clerk
      // answers it happily, and with the mission locked the phrase belonged to
      // no active mission — so assent could never be granted and the engine
      // refused a perfectly good question every time it was asked.
      preconditions: [],
      completeWhen: [{ kind: "fact", key: "info.platform_number", equals: true }],
      failWhen: [{ kind: "clock", afterMinutes: 1150 }],
      effects: [],
      failEffects: [],
      reward: 30,
      keyPhrases: ["s_platform", "s_repeat", "s_thanks"],
      parTurns: 3,
      hintAfterTurns: 2,
      debriefCriterion: "Asked which platform and got a number back, rather than guessing.",
    },
  ],

  /** 6:50pm. The 7:10 is twenty minutes away and the clock runs at three. */
  clock: { startMinutes: 1130, rate: 3 },

  stakes: {
    deadlineMinutes: 1150,
    lastCallMinutes: 1145,
    assentThreshold: 0.4,
    patience: 3,
    patienceGraceTurns: 2,
    cooldownSeconds: 60,
  },

  evaluation: {
    objectives: [
      "Named a destination clearly enough to be understood first time",
      "Said how many, using a real number word rather than holding up fingers",
      "Asked which platform, and understood the answer",
      "Did not try to haggle over a government fare",
      "Finished before the train left",
    ],
  },
};
