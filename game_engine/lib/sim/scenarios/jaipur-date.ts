/**
 * THE GOLDEN SCENARIO — "first date in Jaipur", beginner Hindi.
 *
 * Hand-written on purpose, and written FIRST. This is the exact shape the
 * Scenario Compiler has to learn to emit, so everything downstream — the state
 * engine, the context engine, the voice worker, the evaluator — gets built and
 * tuned against a real target instead of against an imagined one. It is also
 * the demo's insurance: if the compiler misbehaves on the day, this scenario
 * still runs, because nothing loads it through the compiler.
 *
 * WHY IT IS ENTIRELY OUTDOORS
 *
 * The 3D engine builds a street grid — roads, blocks, facades, traffic. It has
 * no interiors: no rooms, no doors, no furnished floors. A cafe interior with
 * "table 4" would be the single largest piece of new 3D work in the project and
 * the least certain to look good. A street-side dhaba with outdoor seating puts
 * the auto stand, the counter, the manager and the date's table in one
 * continuous outdoor scene the existing engine already knows how to render —
 * and it is what an actual evening out in Jaipur looks like anyway.
 *
 * WHERE THE DRAMA COMES FROM
 *
 * One locked fact: the kitchen is out of mushroom pasta. Priya asks for it
 * before the player ever reaches the counter, so the player carries a request
 * into a world that cannot satisfy it and has to negotiate their way back out
 * in a language they barely speak. The waiter and the manager both read that
 * fact off the world, which is why they agree without either being told what
 * the other said — the thing a frozen prompt per NPC can never do.
 */

import type { Condition, Mutation, Scenario } from "../schema";

/**
 * THIS SCENARIO IS FROZEN AT v1 AND IS NOT PLAYABLE.
 *
 * `SCENARIO_VERSION` moved to 2 when missions started completing from facts.
 * Under v2 a `MissionNode` carries `completeWhen`, and every one of the six
 * below is a prose criterion about conversational quality — "greeted Priya in
 * Hindi *and* acknowledged that she was waiting" — with no mechanical proof at
 * all. The facts those criteria would gate on are written by the `effects` of
 * the very missions that would gate on them, so the conversion is circular, not
 * laborious.
 *
 * So it keeps its own local type and stays exactly as written. It is the record
 * of what the first hand-authored scenario looked like, and the writing in it is
 * still the reference for tone. The v2 fixture is `hyderabad-bazaar.ts`.
 */
type LegacyMissionV1 = {
  id: string;
  title: string;
  brief: string;
  preconditions: Condition[];
  characterId: string;
  criterion: string;
  effects: Mutation[];
  reward: number;
};

export type LegacyScenarioV1 = Omit<
  Scenario,
  "v" | "missions" | "phrases" | "stakes" | "characters" | "archetype"
> & {
  v: 1;
  missions: LegacyMissionV1[];
  /** v1 carried only the spoken line; v2 carries roman and English with it. */
  characters: (Omit<Scenario["characters"][number], "opening"> & { opening: string })[];
};

export const JAIPUR_DATE: LegacyScenarioV1 = {
  v: 1,
  id: "jaipur-date",
  title: "First date in Jaipur",
  sourceRequest:
    "Mujhe Hindi nahi aati. Main beginner hoon. Mujhe ek realistic first-date scenario mein practice karni hai.",
  language: "hi-IN",
  languageLabel: "Hindi",
  script: "Devanagari",
  difficulty: "beginner",
  city: "Jaipur",
  premise: `Seven in the evening in the old city. You have a table booked at a
dhaba off the main bazaar and a person you have met exactly once waiting at it.
You do not speak Hindi. Nobody you are about to meet speaks English.`,

  /**
   * Adapted from Purani Sadak's golden-hour palette, pinker in the facades for
   * the old city. `landmark: "delhi"` because there is no Jaipur asset kit yet
   * and the Mughal bazaar arch is the closest read — a Jaipur kit is its own
   * piece of work, not something to fake in a theme.
   */
  theme: {
    sky: ["#2b6fae", "#4f9ad4", "#8fc4e8", "#e2d9e8", "#f8dfc0"],
    fog: 0xd99a72,
    fogNear: 60,
    ground: 0xc0a488,
    pavement: 0xd8c3ab,
    plaza: 0xe0c9b0,
    tarmac: 0x4a4d54,
    lane: 0xf0e6b8,
    buildings: [0xe8a07a, 0xd9736a, 0xf2c9a0, 0xe0845f, 0xf5ddc0, 0xcf6f5c, 0xeab98d],
    canopies: [0xf0392b, 0x1fbf6b, 0xff8c1a],
    leaf: 0x4f9b3f,
    trunk: 0x6b5238,
    sunColour: 0xffe9c4,
    sunIntensity: 2.0,
    ambient: 0.31,
    hemiSky: 0xcfe6ff,
    hemiGround: 0xc79a63,
    hemiIntensity: 0.55,
    archStyle: "mughal",
    autos: 9,
    cars: 5,
    autoCanopy: 0xf5c518,
    exposure: 1.1,
    landmark: "delhi",
  },

  /* Offsets from the chowk centre, same convention as `Npc.pos`. Spread far
   * enough apart that walking between them costs real time — the clock is what
   * turns a slow negotiation into a consequence. */
  locations: [
    {
      id: "doorstep",
      name: "Your doorstep",
      pos: [-30, 24],
      radius: 4,
      arrival: "Your street. The dhaba is a ride away, and you are already close to late.",
    },
    {
      id: "auto-stand",
      name: "The auto stand",
      pos: [-15, 11],
      radius: 4,
      arrival: "Three autos, one driver awake.",
    },
    {
      id: "dhaba-counter",
      name: "The dhaba counter",
      pos: [17, -7],
      radius: 4,
      arrival: "The counter. Vikram is wiping down the same spot he was wiping when you walked up.",
    },
    {
      id: "dhaba-table",
      name: "Priya's table",
      pos: [23, -15],
      radius: 4,
      arrival: "The corner table under the string lights. She has been here a while.",
    },
    {
      id: "managers-desk",
      name: "The manager's desk",
      pos: [12, -19],
      radius: 4,
      arrival: "A plastic table by the kitchen door, a ledger, and Suresh behind it.",
    },
  ],

  characters: [
    {
      id: "ramesh",
      name: "Ramesh",
      role: "Auto driver",
      speaker: "aditya",
      colour: 0xf4d03f,
      locationId: "auto-stand",
      persona: `You are Ramesh, forty-odd, an auto driver at this stand for
eleven years. You are not unkind but you are not sentimental either: the meter
is broken, the fare is negotiated, and you open high. You can tell within one
sentence that this passenger does not speak Hindi, and you find that mildly
funny rather than annoying. You will come down on the fare if they push back
even slightly — but only if they actually push back.`,
      knows: ["auto.destination", "auto.fare_agreed", "clock.late"],
      wants: "A fare to somewhere close, at a price that flatters you slightly.",
      provokes: "Being called a thief or a cheat. Someone waving money at you like a tip.",
      opening: "हाँ जी, कहाँ जाना है?",
    },
    {
      id: "priya",
      name: "Priya",
      role: "Your date",
      speaker: "priya",
      colour: 0xe57ea3,
      locationId: "dhaba-table",
      persona: `You are Priya, late twenties, a graphic designer from Jaipur.
You met this person once, briefly, at a friend's thing, and you agreed to this
with more curiosity than confidence. You are warm but you are also shy, and you
fill silences by asking questions rather than by talking about yourself. You
know their Hindi is bad; you think the fact that they are trying is charming,
and you slow down for them without ever saying that you are slowing down.
You have been waiting a while and you are aware of it.`,
      knows: ["date.mood", "date.wants_dish", "order.placed", "clock.late"],
      wants: "An evening that feels like the other person is actually present.",
      provokes: "Being ignored for a phone. Being talked over. Rudeness to the staff.",
      opening: "अरे, आ गए आप! बैठिए ना।",
    },
    {
      id: "vikram",
      name: "Vikram",
      role: "Waiter",
      speaker: "rahul",
      colour: 0x6fa8dc,
      locationId: "dhaba-counter",
      persona: `You are Vikram, twenty-three, working the counter. You are quick,
a little bored, and entirely straightforward: if the kitchen is out of
something you say so immediately rather than apologising around it. You do not
have the authority to invent a substitute or discount anything — that is the
manager's call, and you will say so plainly if pushed.`,
      knows: [
        "restaurant.mushroom_pasta",
        "restaurant.pesto_pasta",
        "order.placed",
        "order.refused",
        "substitute.agreed",
      ],
      wants: "To take a clear order and get back to the counter.",
      provokes: "Being snapped at about something the kitchen decided, not you.",
      opening: "जी बोलिए, क्या लाऊँ?",
    },
    {
      id: "suresh",
      name: "Suresh",
      role: "Manager",
      speaker: "ratan",
      colour: 0x93c47d,
      locationId: "managers-desk",
      persona: `You are Suresh, fifties, you run this place. You are courteous in
the practised way of someone who has defused a hundred small complaints, and
you solve problems by offering something concrete rather than by apologising
twice. If the kitchen is out of a dish you will name what it can actually make
and, if the customer has been patient, take something off the bill.`,
      knows: [
        "restaurant.mushroom_pasta",
        "restaurant.pesto_pasta",
        "order.refused",
        "substitute.agreed",
        "clock.late",
      ],
      wants: "The table fed and nobody leaving unhappy.",
      provokes: "Threats, or contempt aimed at Vikram.",
      opening: "नमस्ते जी, कोई दिक्कत है क्या?",
    },
  ],

  /**
   * Note which of these are locked. `restaurant.mushroom_pasta` is the physics
   * of this scenario: no conversation, however persuasive, brings it back. That
   * single `mutable: false` is the whole "the model never controls reality"
   * principle reduced to one line of data.
   */
  facts: [
    {
      key: "restaurant.mushroom_pasta",
      value: false,
      label: "the kitchen has run out of mushroom pasta tonight",
      visibility: ["vikram", "suresh"],
      mutable: false,
    },
    {
      key: "restaurant.pesto_pasta",
      value: true,
      label: "pesto pasta is available and the kitchen can make it right now",
      visibility: ["vikram", "suresh"],
      mutable: false,
    },
    {
      key: "auto.destination",
      value: "none",
      label: "the destination the passenger has managed to communicate",
      visibility: ["ramesh"],
      mutable: true,
    },
    {
      key: "auto.fare_agreed",
      value: false,
      label: "a fare has been agreed with the driver",
      visibility: ["ramesh"],
      mutable: true,
    },
    {
      key: "date.wants_dish",
      value: "none",
      label: "the dish Priya has asked the player to order for her",
      visibility: ["priya"],
      mutable: true,
    },
    {
      key: "date.knows_about_problem",
      value: false,
      label: "Priya has been told the kitchen cannot make what she asked for",
      visibility: ["priya"],
      mutable: true,
    },
    {
      key: "date.mood",
      value: "waiting",
      label: "how the evening is going for Priya: waiting, warm, flat, or annoyed",
      visibility: ["priya"],
      mutable: true,
    },
    {
      key: "order.placed",
      value: "none",
      label: "what the player has actually asked the counter for",
      visibility: ["vikram", "suresh"],
      mutable: true,
    },
    {
      key: "order.refused",
      value: false,
      label: "the counter has told the player that what they asked for is unavailable",
      visibility: ["vikram", "suresh"],
      mutable: true,
    },
    {
      key: "substitute.agreed",
      value: "none",
      label: "the replacement dish the player and the dhaba have settled on",
      visibility: "all",
      mutable: true,
    },
    {
      key: "clock.late",
      value: false,
      label: "the player is noticeably late and everyone can tell",
      visibility: "all",
      mutable: true,
    },
  ],

  /**
   * A graph, not a list. Only `reach-the-dhaba` starts open; everything else
   * unlocks off facts, which is what lets the player take the manager route
   * before the waiter one, or tell Priya about the problem before it is fully
   * solved, without the scenario having anticipated that ordering.
   */
  missions: [
    {
      id: "reach-the-dhaba",
      title: "Get to the dhaba",
      brief: "Tell the driver where you are going and agree on a fare.",
      preconditions: [],
      characterId: "ramesh",
      criterion:
        "The player has communicated a destination the driver understood AND either accepted a fare or negotiated one. Both are required — a destination with no price settled is not enough.",
      effects: [
        { kind: "fact", key: "auto.fare_agreed", value: true },
        { kind: "fact", key: "date.mood", value: "warm" },
      ],
      reward: 40,
    },
    {
      id: "greet-priya",
      title: "Meet Priya",
      brief: "Introduce yourself and apologise for the wait.",
      preconditions: [{ kind: "mission", id: "reach-the-dhaba", state: "complete" }],
      characterId: "priya",
      criterion:
        "The player has greeted Priya in Hindi and acknowledged that she was waiting. A bare 'namaste' with no acknowledgement of the wait does not count.",
      effects: [],
      reward: 30,
    },
    {
      id: "learn-her-order",
      title: "Find out what she wants",
      brief: "Ask Priya what she would like to eat.",
      preconditions: [{ kind: "mission", id: "greet-priya", state: "complete" }],
      characterId: "priya",
      criterion:
        "The player has asked Priya what she wants to eat and she has named a dish. The player must have asked — her volunteering it unprompted does not satisfy this.",
      effects: [{ kind: "fact", key: "date.wants_dish", value: "mushroom pasta" }],
      reward: 40,
    },
    {
      id: "place-the-order",
      title: "Order at the counter",
      brief: "Ask Vikram for what Priya wanted.",
      preconditions: [{ kind: "fact", key: "date.wants_dish", notEquals: "none" }],
      characterId: "vikram",
      criterion:
        "The player has asked the counter for the dish Priya named, clearly enough that Vikram knows what was requested.",
      effects: [
        { kind: "fact", key: "order.placed", value: "mushroom pasta" },
        { kind: "fact", key: "order.refused", value: true },
      ],
      reward: 50,
    },
    {
      id: "find-a-substitute",
      title: "Sort out the problem",
      brief: "The kitchen is out. Find out what they can actually make.",
      preconditions: [{ kind: "fact", key: "order.refused", equals: true }],
      characterId: "suresh",
      criterion:
        "The player has got a concrete alternative dish out of the dhaba and accepted it, rather than merely complaining or asking again for the unavailable dish.",
      effects: [{ kind: "fact", key: "substitute.agreed", value: "pesto pasta" }],
      reward: 60,
    },
    {
      id: "tell-priya",
      title: "Go back and explain",
      brief: "Tell Priya what happened and what you ordered instead.",
      preconditions: [{ kind: "fact", key: "substitute.agreed", notEquals: "none" }],
      characterId: "priya",
      criterion:
        "The player has explained to Priya, in Hindi, both that her dish was unavailable and what was ordered in its place. One half without the other is not enough.",
      effects: [
        { kind: "fact", key: "date.knows_about_problem", value: true },
        { kind: "fact", key: "date.mood", value: "warm" },
      ],
      reward: 80,
    },
  ],

  /** 7pm. Three in-world minutes per real minute, so dawdling is legible. */
  clock: { startMinutes: 19 * 60, rate: 3 },

  evaluation: {
    objectives: [
      "Communicated a destination and settled a fare without switching to English",
      "Opened the conversation with Priya and acknowledged the wait",
      "Asked a question and understood the answer, rather than only making statements",
      "Handled the unavailable dish by negotiating rather than repeating the request",
      "Relayed a problem from one person to another accurately",
    ],
  },
};
