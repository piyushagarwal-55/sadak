/**
 * WHAT THE MODEL IS TOLD, AND WHAT IT IS NOT.
 *
 * One turn of conversation, rendered from world state. Two messages: a system
 * message that describes who this person is and what the nine legal actions
 * are, and a user message that describes what is true right now.
 *
 * THE OUTPUT SHAPE IS FOUR FLAT STRINGS
 *
 * `{act, target, reply_native, reply_roman}`. No arrays, no nesting, and above
 * all NO NUMBERS. The model never names a price: it chooses `quote`, `concede`,
 * `accept` or `refuse`, and `actions.ts` reads the rupees off the ladder. That
 * is not a stylistic preference — it removes the only field a 27B model could
 * get wrong in a way that moves money, and it keeps the JSON in the shape
 * `lib/game/prompt.ts:23` has already been fought into stability on this model.
 *
 * WHAT EACH CHARACTER SEES
 *
 * Only facts their `knows` list or the fact's own `visibility` admits, and
 * never anything marked `"player"`. That filter is the entire reason two
 * vendors agree about the world without either being told what the other said,
 * and it is why the bangle seller cannot quote you a price she learnt from the
 * vegetable seller's prompt.
 *
 * Facts are rendered through their authored English labels, never as
 * `key = value`. Handing a model `stock.L1.tomato = 0` and hoping it infers the
 * meaning is how you get a shopkeeper cheerfully selling what she has run out
 * of.
 */

import type {
  FactSpec,
  FactValue,
  MissionNode,
  Scenario,
  SimCharacter,
  WorldState,
} from "./schema";
import { clockLabel } from "./state";
import { VERBS } from "./actions";
import type { ObstacleChoice } from "./obstacles";
import { clauseFor } from "./obstacles";
import { worldBrief } from "./brief";
import { phaseBlock, type ExchangePhase } from "./exchange";

/* ------------------------------------------------------------------ *
 * Facts
 * ------------------------------------------------------------------ */

function visibleTo(spec: FactSpec, character: SimCharacter): boolean {
  if (spec.visibility === "player") return false;
  if (spec.visibility === "all") return true;
  if (Array.isArray(spec.visibility) && spec.visibility.includes(character.id)) return true;
  return character.knows.includes(spec.key);
}

/**
 * Type-directed, because a boolean and a count read differently in prose.
 *
 * `false` becomes "— not yet" rather than being dropped: a shopkeeper needs to
 * know the customer has NOT yet greeted her as much as she needs to know they
 * have. `null` is dropped, because "no price has been named yet" is the label's
 * job to say, not the renderer's.
 */
function factLine(spec: FactSpec, value: FactValue): string | null {
  if (value === null || value === undefined) return null;
  if (value === true) return `- ${spec.label}`;
  if (value === false) return `- ${spec.label} — not yet`;
  return `- ${spec.label}: ${value}`;
}

/** Patience as behaviour. Never as a number — a model told its counter reads 1 performs running out. */
function dispositionLine(patience: number): string {
  if (patience >= 3) return "";
  if (patience === 2) {
    return "You have other customers waiting. Say it in two sentences, not three.";
  }
  return "You are close to giving up on this one. One more sentence.";
}

/* ------------------------------------------------------------------ *
 * What the person behind the counter still wants
 * ------------------------------------------------------------------ */

/**
 * SHE IS IN THIS CONVERSATION TOO.
 *
 * The complaint that produced this function was "it feels like a hardcoded
 * confirmation": the player said three sentences, the vendor agreed to each one
 * in turn, and the errand closed. Every run, the same three.
 *
 * The cause was not the model. It was that the model had nothing to want. It
 * was given a price ladder and a customer and told to react, so it reacted —
 * minimally, because a shopkeeper with no business of her own has no reason to
 * open her mouth twice. A real exchange in a real market is not the customer
 * asking and the seller confirming; it is two people each trying to find
 * something out.
 *
 * So this hands her her half of it: what she still does not know, and one
 * ordinary human thing to be curious about. The first list comes from world
 * state and changes as the errand moves. The second is drawn from a deck by the
 * run's own seed, which is why the same errand played twice is not the same
 * conversation — she asks you where you are from one run and complains about
 * the heat the next.
 *
 * None of it can move a rupee. These are things to SAY, and saying is not
 * doing: the acts are still the nine, the gate is still `assent`, and the
 * arithmetic is still the engine's. The model has been given something to want,
 * not something to decide.
 */

/** Ordinary human curiosity. Not about the errand, which is the point of it. */
const SMALL_TALK: string[] = [
  "Ask them where they are from — you have not seen them in this lane before.",
  "Ask what they are cooking. You have opinions about it.",
  "Complain, briefly and cheerfully, about how hot it has been.",
  "Mention that prices have gone up this week and it is not your doing.",
  "Ask whether they are new to the city. You are curious, not suspicious.",
  "Tell them your stuff came in this morning and is better than the next stall's.",
  "Ask if they want a bag, or if they have brought their own.",
  "Say something about the crowd today — more than usual, or less.",
];

export function wantsOf(
  scenario: Scenario,
  state: WorldState,
  characterId: string,
  seed = 0
): string[] {
  const out: string[] = [];
  const turns = state.turns[characterId] ?? 0;

  for (const m of scenario.missions) {
    if (m.characterId !== characterId) continue;
    // A FINISHED SALE IS STILL SOMETHING SHE KNOWS.
    //
    // This used to skip everything that was not `active`, so the moment the
    // tomatoes were paid for the "the deal is done, stop naming prices" line
    // vanished with the mission — and she was measured asking for ₹70 again two
    // turns after taking the money. Complete missions are exactly the ones she
    // most needs to remember.
    const status = state.missions[m.id];
    if (status !== "active" && status !== "complete") continue;

    if (m.template.kind === "buy") {
      const { slot, item } = m.template;
      const named = typeof state.facts[`rung.${slot}.${item}`] === "number";
      const bought =
        status === "complete" ||
        state.facts[`bought.${slot}.${item}`] === true ||
        state.facts[`bought.${item}`] === true;

      if (bought) {
        out.push(
          "They have paid and taken it. The deal is finished: do not sell it to " +
            "them again and do not say a price or any number again. Ask if they " +
            "need anything else, or send them off warmly."
        );
      } else if (!named) {
        out.push("You do not yet know what this customer actually wants. Find out.");
      } else {
        // The beat that was missing. A vendor who hands over a kilo nobody asked
        // for is not being generous, she is skipping the only turn in the
        // conversation where the customer has to produce a number.
        out.push(
          "You have named your price but you still do not know HOW MUCH they want. " +
            "Ask before you weigh anything out — you are not guessing at a quantity."
        );
      }
    } else if (status === "active") {
      out.push("They have come to you for something. Let them ask; do not guess at it.");
    }
  }

  // One human thing, rotating with the run and the turn. Not on the very first
  // turn — somebody who opens with "where are you from" before hello is a
  // different kind of person from the one we are writing.
  if (turns >= 1) {
    out.push(SMALL_TALK[(seed + turns * 3) % SMALL_TALK.length]);
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * The system message
 * ------------------------------------------------------------------ */

const VERB_GLOSS: Record<string, string> = {
  greet: "you are greeting them",
  clarify: "you genuinely could not make out what they said",
  quote: "you are naming your price for the first time",
  concede: "you are coming down",
  accept: "you are handing the goods over and taking the money, right now",
  refuse: "you are holding your price",
  point: "you are sending them to another stall",
  tell: "you are telling them something they asked about",
  end: "the exchange is over and they should walk on",
};

/**
 * Models mirror the script they are typed at, so a player writing romanised
 * Telugu gets romanised Telugu back — which breaks both the voice and the point
 * of the game. Telling it to "use Telugu script" does not hold. Feeding it the
 * scenario's own phrases as worked examples, LAST, does. That is the finding
 * `lib/game/prompt.ts:114-118` records, reused verbatim here including the
 * position: this block goes at the end of the system message, after everything.
 */
function scriptBlock(scenario: Scenario): string {
  const samples = scenario.phrases.slice(0, 6);
  const first = samples[0];
  return `SCRIPT (this overrides everything above)
Your reply MUST be written in the ${scenario.script} script. This is what
correctly written ${scenario.languageLabel} looks like:
${samples.map((p) => `  ${p.native}`).join("\n")}

The player will often speak or type to you in Latin letters, like "${first?.roman ?? ""}".
Understand them, but NEVER copy their script. Answering "${first?.roman ?? ""}" instead of
"${first?.native ?? ""}" is a failure. Every reply is rendered as ${scenario.script} text and
read aloud by a ${scenario.languageLabel} voice, so Latin letters break it.`;
}

export function turnSystemPrompt(
  scenario: Scenario,
  character: SimCharacter,
  opts: {
    obstacles?: ObstacleChoice[];
    /** What this character has on their stall, in plain words. */
    stock?: string[];
    /**
     * True when nothing this character sells has any room in it.
     *
     * A ticket clerk and a bazaar vendor are opposite jobs, and the haggling
     * block is actively wrong for the first: told to open high and come down
     * slowly, the clerk quoted the fixed fare on every single turn and never
     * once handed a ticket over.
     */
    fixedPrice?: boolean;
    /** Her own unfinished business this turn. See `wantsOf`. */
    wants?: string[];
    /** Other people standing in this exchange, described in a line each. */
    alsoHere?: string[];
    /**
     * Where this exchange is, from `lib/sim/exchange.ts`.
     *
     * One reading, shared with the coach, the panel and the ending. The prompt
     * used to work this out for itself in a `stageOf` that lived here, which is
     * how the card and the shopkeeper came to disagree about the same turn.
     */
    phase?: { phase: ExchangePhase; agreed: boolean };
    /**
     * The language the PLAYER reads, as a label. Not the one they are learning.
     *
     * The subtitle under her line used to be the romanisation and nothing else,
     * which is Telugu spelled in Latin letters — useful for getting your mouth
     * round it and no use at all for knowing what she said. A learner who has
     * told us they understand English was reading "Kilo ki ₹40. Meevare enta
     * kaavali?" and guessing.
     */
    understands?: string;
  } = {}
): string {
  const obstacle = opts.obstacles ? clauseFor(opts.obstacles, character.id) : null;

  return `${worldBrief(scenario, character)}

YOU ARE ${character.name.toUpperCase()}, ${character.role}, in ${scenario.city}.
${character.persona}
${obstacle ?? ""}

WHAT IS ON YOUR STALL RIGHT NOW
${(opts.stock ?? []).map((s) => `- ${s}`).join("\n") || "- nothing in particular"}
These counts are the truth about your own stall. If a line says you have four
kilos, you have four kilos — do not tell anybody you have run out of something
that is still there, and do not invent stock that is not listed.

WHAT YOU WANT: ${character.wants}
WHAT SETS YOU OFF: ${character.provokes}

You are NOT a teacher. Never explain grammar, never correct the player, never
break character, never mention being an AI, never narrate yourself in brackets.
The player is learning ${scenario.languageLabel} badly and that is fine — fumbling
your language is not rudeness and you never punish it.

${
    opts.fixedPrice
      ? `HOW MONEY WORKS AT YOUR COUNTER
Your price is FIXED. It is not yours to move and nobody has ever talked you out
of a rupee of it. Say "quote" the first time you name it. If they try to bargain,
"refuse" — politely, briefly, and without apology.

THE MOMENT THEY HAVE TOLD YOU WHAT THEY WANT AND HOW MANY, YOU "accept".
That is the whole job. Do not name the price a second time, do not wait to be
asked again, do not say "bring the money" — take it and hand the thing over.
Quoting twice at a fixed-price counter is the one thing that would get you
shouted at, because there is a queue.`
      : `HOW MONEY WORKS AT YOUR STALL
You open high and you come down, slowly, the way anyone does. You have a lowest
price you will never go under and never say out loud. You do not choose the
numbers — you choose WHEN to come down. Say "quote" the first time you name a
price, "concede" each time you come down, "accept" when you are handing the
goods over, "refuse" when you are holding where you are.`
  }

YOU ONLY DO YOUR OWN HALF
You do not report what the customer just did — a separate reader does that, at
the same moment. You do not write what the customer says next either; something
else does that, afterwards, once your line exists to answer.

Both of those used to be your job too, and a third of what you were being told
was the customer's script. You started speaking as them: "I needed tomatoes but
today they are all finished", from a woman whose stall they are on. You are the
shopkeeper. Say your line.

WORDS ARE NOT DEEDS
Saying "here, take it" does not move a single rupee. Only an ACTION moves
anything, and these nine are the only actions that exist:

${VERBS.map((v) => `  ${v.padEnd(9)} ${VERB_GLOSS[v]}`).join("\n")}

Rules about actions:
- One action per turn. Pick the one your reply actually does.
- Never "accept" to mean "I would accept that". It means the goods change hands.
- "point" only to somebody named in WHO IS HERE, and your reply MUST say that
  person or stall out loud.
- "tell" only about something under WHAT YOU KNOW THAT THEY MIGHT ASK, and your
  reply MUST carry the answer itself — not a promise to answer, and never a
  guess. Talking about YOUR OWN STALL is not "tell": what you have, what it
  costs, how fresh it is, is just talking, so use "greet" for it.
- "greet" or "clarify" when nothing else fits.

${opts.phase ? `${phaseBlock(opts.phase.phase, opts.phase.agreed)}

` : ""}YOU ARE IN THIS CONVERSATION TOO
You are not a counter that answers questions. You have a stall to run, a day
behind you and opinions about most things. So:
- Ask them things back. A reply that only answers and stops is a machine.
- Do not finish the exchange early. Handing over the goods is not the end of a
  conversation — people say something after that.
- Never say the same sentence twice in one exchange. If you have already said
  it, say it another way or say something else.
- TALK IN WHOLE SENTENCES. Two or three of them, the way somebody behind a
  stall actually talks: one that answers what they asked, one that is yours —
  what you think of the goods, what kind of day it has been, what you want to
  know from them. A one-word answer or a bare half-sentence is a vending
  machine, and the customer is here to learn how people speak.

${
    (opts.alsoHere ?? []).length
      ? `WHO ELSE IS AT YOUR STALL
${(opts.alsoHere ?? []).map((w) => `- ${w}`).join("\n")}
They are other CUSTOMERS standing near your stall. They are not places, not
stalls, and never the answer to anything the customer asks you — if somebody
asks you where a shop is, naming one of these people is nonsense. You may
answer them, talk over them or tell them to wait, but the person buying from
you is the one who speaks in THE PLAYER JUST SAID.

`
      : ""
  }WHAT YOU STILL WANT
${(opts.wants ?? []).map((w) => `- ${w}`).join("\n") || "- nothing in particular; just be good company"}

${scriptBlock(scenario)}

OUTPUT
One JSON object. Exactly these five keys, in this order, nothing else:
{"act":"quote","target":"tomato","reply_native":"...","reply_roman":"...","reply_meaning":"..."}
- act:          one word from the nine above.
- target:       the good, the stall or the information key your action is about.
                Write "" when your action needs no target.
- reply_native: TWO or THREE whole sentences in ${scenario.script}. A voice reads this
                aloud, so write how a person in a market really talks — not a
                one-word answer, and not a fragment.
- reply_roman:  the same line in Latin letters, so they can read it aloud.
- reply_meaning: what your line MEANS, written in ${opts.understands ?? "English"}.
                Not a transliteration — a translation. This is the only way the
                player knows what you said, so it must carry the actual sense,
                including any number you named.`;
}

/* ------------------------------------------------------------------ *
 * The user message
 * ------------------------------------------------------------------ */

/**
 * The last few PUBLIC changes, as sentences.
 *
 * This is the cross-character consistency channel: the bangle seller learns
 * that a kilo of tomatoes was just bought without anybody telling her, because
 * that fact is `visibility: "all"` and the world says so. Private facts — a
 * vendor's own floor price, the player's wallet — never appear here, whatever
 * happened to them.
 */
function recentWorldLines(scenario: Scenario, state: WorldState, limit = 3): string[] {
  const lines: string[] = [];

  for (let i = state.log.length - 1; i >= 0 && lines.length < limit; i--) {
    const { kind, mutation } = state.log[i];
    if (kind !== "fact" || mutation?.kind !== "fact") continue;

    const spec = scenario.facts.find((f) => f.key === mutation.key);
    if (!spec || spec.visibility !== "all") continue;

    const line = factLine(spec, mutation.value);
    if (line) lines.push(line);
  }

  return lines.reverse();
}

/**
 * The economy, rendered as ONE number and some behaviour.
 *
 * The naive rendering hands the character every price fact she can see, which
 * on turn one means her prompt contains the sentence "Lakshmi will not sell
 * tomatoes below ₹32 a kilo" — and a model that has been shown ₹32 will
 * eventually say ₹32, on the first turn, before any haggling has happened. The
 * floor is the one number in the game that must never be spoken, and a system
 * instruction not to say it is a hope, not a mechanism.
 *
 * So the floor is never rendered as a number at all. What the character is told
 * is the price she is asking RIGHT NOW — read off the ladder rung the engine
 * holds — and how much room she has left, as a disposition.
 */
function priceLines(scenario: Scenario, state: WorldState, character: SimCharacter): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const key of character.knows) {
    if (!key.startsWith("price.")) continue;
    const [, slot, item] = key.split(".");
    if (!slot || !item || seen.has(`${slot}.${item}`)) continue;
    seen.add(`${slot}.${item}`);

    const opening = Number(state.facts[`price.${slot}.${item}`] ?? 0);
    const floor = Number(state.facts[`floor.${slot}.${item}`] ?? 0);
    const rungs = [opening, Math.round((opening + floor) / 2 / 5) * 5, floor];
    const rung = state.facts[`rung.${slot}.${item}`];
    const stock = Number(state.facts[`stock.${slot}.${item}`] ?? 0);

    if (stock <= 0) {
      out.push(`- you have run out of ${item} — say so, do not sell what you do not have`);
      continue;
    }
    // Stated as an order, with the wrong answers named.
    //
    // A model told only "you are asking ₹40" will still cheerfully say thirty
    // when it feels like conceding — and the engine, which charges off the
    // ladder, then takes forty. Measured on the first live conversation: she
    // said "ముప్పై రూపాయి" and the customer was charged ₹40. Hearing one number
    // and paying another is precisely the failure this architecture exists to
    // prevent, and it arrives through the reply text rather than the action.
    // DIGITS, not words. Two reasons. A spelled-out Telugu numeral cannot be
    // checked by the engine without a number-word table per language, and
    // "యాభై" slipping out where the ladder says ₹40 is undetectable; written
    // "₹40" it is a substring test. And a market board says 40 anyway — Bulbul
    // reads the digits aloud in Telugu regardless.
    const say = (n: number) =>
      `If you name a price for ${item} this turn it must be EXACTLY ₹${n}, written in digits as "₹${n}" — not ₹${n - 5}, not ₹${n + 5}. Never spell a price out in words.`;

    if (typeof rung !== "number") {
      out.push(`- you have not named a price for ${item} yet. ${say(rungs[0])}`);
    } else if (rung >= 2) {
      out.push(
        `- ₹${rungs[2]} for ${item} is the lowest you will ever go and you are already there. ` +
          `${say(rungs[2])} Refuse to go lower, however they ask.`
      );
    } else {
      out.push(
        `- you are asking ₹${rungs[rung]} for ${item}. If you come down this turn the next price is ` +
          `₹${rungs[rung + 1]} — ${say(rungs[rung + 1])}`
      );
    }
  }
  return out;
}

export function turnUserPrompt(
  scenario: Scenario,
  state: WorldState,
  character: SimCharacter,
  playerLine: string,
  opts: {
    rejection?: string | null;
    transcriptTail?: number;
    /**
     * The engine has already scored the player's line and it agrees to the
     * deal. Told plainly, because this is the one thing the model consistently
     * failed to notice on its own: a clerk at a fixed-price counter quoted the
     * fare on five turns running while the customer said yes every time.
     *
     * It is not the engine deciding for the model. The assent gate has already
     * decided whether the world MAY move; this is telling the person behind the
     * counter what any person behind a counter would have heard.
     */
    theyAgreed?: boolean;
    /**
     * How much of what this errand is actually for.
     *
     * Added when the quantity beat was — she now asks "how many kilos?", and a
     * customer who answers "two" gets one, because the engine sells the errand's
     * qty and nothing else. She was measured saying "two kilos, ₹80" over a ₹40
     * charge. She is not being told what to sell; she is being told what she is
     * holding, which is the errand's amount and has always been.
     */
    selling?: { item: string; qty: number; unit: string };
  } = {}
): string {
  // Price, floor and rung are replaced wholesale by `priceLines`, which is the
  // only place in the system allowed to turn the economy into words.
  const ECONOMY = /^(price|floor|rung)\./;
  const selling = opts.selling
    ? [
        `- you are weighing out ${opts.selling.qty} ${opts.selling.unit}${
          opts.selling.qty === 1 ? "" : "s"
        } of ${opts.selling.item} and charging for exactly that much, whatever ` +
          "number they say. If they ask for more, tell them that is all you can spare.",
      ]
    : [];

  const facts = [
    ...priceLines(scenario, state, character),
    ...selling,
    ...scenario.facts
      .filter((f) => visibleTo(f, character) && !ECONOMY.test(f.key))
      .map((f) => factLine(f, state.facts[f.key]))
      .filter(Boolean),
  ];

  const patience = Number(state.facts[`patience.${character.id}`] ?? 3);
  const disposition = dispositionLine(patience);
  const weather =
    state.facts["market.closing"] === true ? "The stalls around you are packing up." : "";

  const tail = state.log
    .filter((e) => e.kind === "say" && (e.characterId === character.id || e.characterId === "player"))
    .slice(-(opts.transcriptTail ?? 6))
    .map((e) => `${e.characterId === "player" ? "CUSTOMER" : "YOU"}: ${e.text}`);

  return `RIGHT NOW
It is ${clockLabel(state.clock)}. ${weather}
${facts.join("\n")}
${disposition}
${recentWorldLines(scenario, state).join("\n")}
${opts.rejection ? `\n${opts.rejection}` : ""}

TALKING SO FAR
${tail.length ? tail.join("\n") : "(you have not spoken yet)"}

THE PLAYER JUST SAID
${playerLine || "(nothing — they went quiet)"}${
    opts.theyAgreed
      ? '\n\nThey have agreed to the price. Hand it over and take the money: your action this turn is "accept".'
      : ""
  }`;
}

/* ------------------------------------------------------------------ *
 * The third person in the exchange
 * ------------------------------------------------------------------ */

/**
 * SOMEBODY ELSE IS TALKING.
 *
 * The hardest thing about using a language in public is not vocabulary and it
 * is not grammar. It is that the other person is not waiting for you. In a
 * two-party chat the shopkeeper asks, you answer, she waits — politely, forever
 * — and a learner can be fluent in that and mute in a queue.
 *
 * So on the advanced band a third voice stands in the exchange: the woman ahead
 * of you, who talks to the seller about you, over you, and occasionally to you.
 *
 * WHAT MAKES THIS SAFE
 *
 * The return value of the call this prompt drives is a string. Not an act, not
 * a target, not a mutation — a string, which the route puts on the screen and
 * into the transcript and does nothing else with. A bystander therefore cannot
 * sell, cannot agree to a price, cannot complete a mission and cannot move a
 * rupee, no matter what she says or what anyone tells her to say. That is why
 * there is no verb list in this prompt: there is nothing for her to choose.
 *
 * She is told the price only as the number already spoken out loud in front of
 * her, never the floor, because she is the one character in the cast with a
 * motive to tell you what the seller will really take.
 */
export function companionSystemPrompt(
  scenario: Scenario,
  companion: SimCharacter,
  vendor: SimCharacter,
  understands = "English"
): string {
  return `You are ${companion.name}, ${companion.role}, at ${vendor.name}'s stall in ${scenario.city}.
${companion.persona}

WHAT YOU WANT: ${companion.wants}
WHAT SETS YOU OFF: ${companion.provokes}

You are NOT the seller. You cannot sell anything, you cannot agree to any price
on anybody's behalf, and nothing you say hands over any goods. You are a person
standing there with your own evening to get on with.

WHAT YOU DO
Pick ONE and keep it to a single short sentence:
- say something to ${vendor.name} about this customer, in front of them
- tell the customer it is dear, or that the next lane is cheaper
- hurry them along
- ask the customer something — where they are from, what they are cooking
- agree with whoever you agree with

NEVER SAY A NUMBER
No rupee amounts, no weights, no "that should be fifty". Prices at this stall
are ${vendor.name}'s to name and yours to have opinions about. A number out of
your mouth is a price nobody is charging, and the customer will believe it.

You are NOT a teacher. Never explain grammar, never correct anyone's
${scenario.languageLabel}, never break character, never mention being an AI.
A customer fumbling the language is ordinary and you do not remark on it.

${scriptBlock(scenario)}

OUTPUT
One JSON object, exactly these three keys:
{"reply_native":"...","reply_roman":"...","reply_meaning":"..."}
- reply_native: ONE short spoken sentence in ${scenario.script}. Never two.
- reply_roman:  the same line in Latin letters.
- reply_meaning: what it MEANS, written in ${understands}. A translation, not a
                transliteration.`;
}

export function companionUserPrompt(
  state: WorldState,
  companion: SimCharacter,
  vendor: SimCharacter,
  playerLine: string
): string {
  const tail = state.log
    .filter((e) => e.kind === "say")
    .slice(-5)
    .map((e) => {
      if (e.characterId === "player") return `CUSTOMER: ${e.text}`;
      if (e.characterId === companion.id) return `YOU: ${e.text}`;
      return `${vendor.name.toUpperCase()}: ${e.text}`;
    });

  return `WHAT HAS JUST BEEN SAID
${tail.length ? tail.join("\n") : "(nothing yet)"}

THE CUSTOMER SAID: ${playerLine || "(nothing)"}

Say your one sentence. Do not repeat anything already said above.`;
}

/**
 * The sentence shown to the model after the engine overruled it.
 *
 * Without it the model repeats the refused action forever, because from its
 * side nothing happened and its own reply is in the transcript as though it
 * had. Written as an observation, not as an instruction: a model told "you
 * broke a rule" apologises at the customer in character.
 */
export function rejectionLine(reason: string, mission: MissionNode | null): string {
  const what = mission?.template.kind === "buy" ? mission.template.item : "that";
  switch (reason) {
    case "below_floor":
      return `Last turn you tried to let ${what} go for less than you will take. Nothing happened.`;
    case "no_money":
      return `Last turn you tried to hand over ${what}, but they did not have the money. Nothing happened.`;
    case "no_stock":
      return `Last turn you tried to hand over ${what} you do not have. Nothing happened.`;
    case "no_assent":
      return `Last turn you acted as though they had agreed, but they had not said so. Nothing happened.`;
    case "dont_know":
      return `Last turn you claimed to tell them something without actually saying it. Nothing happened.`;
    default:
      return `Last turn your action did not go through. Nothing happened.`;
  }
}
