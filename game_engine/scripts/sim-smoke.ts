/**
 * Smoke test for the simulation core: npm run sim:smoke
 *
 * The state engine is the piece everything else trusts, and it is the piece
 * with no UI to notice when it breaks. This walks the demo scenario end to end
 * and asserts the things that must never stop being true — above all that a
 * locked fact stays locked, because that single guarantee is what separates
 * this from a chatbot with extra steps.
 *
 * It runs against `hyderabad-bazaar.ts` rather than the Jaipur scenario, which
 * is frozen at v1 and explains why in its own header.
 */

import { HYDERABAD_BAZAAR as S } from "../lib/sim/scenarios/hyderabad-bazaar";
import { openingState, validateScenario, type Mutation } from "../lib/sim/schema";
import { advanceClock, applyMutations, clockLabel, isComplete, missionFor, settle } from "../lib/sim/state";
import { assent, closestPhrase, dropPhantomPrice, ladderNumbers, patienceCost, producedFunctions, refusalMeaning, resolveAct, settleVerb, type Heard } from "../lib/sim/actions";
import { applyObstacles, chooseObstacles, obstacleSetup } from "../lib/sim/obstacles";
import { conversationScore, scoreTurn } from "../lib/sim/turnscore";
import { becauseForMove, coachFor, goalFor, vetCoachLine } from "../lib/sim/coach";
import type { Verb } from "../lib/sim/actions";
import { bindingFor } from "../lib/sim/compile/bind";
import { worldBrief } from "../lib/sim/brief";
import { historyFor, progressAfter, recordFor, recordRun } from "../lib/sim/learner";
import { turnReadSchema } from "../lib/sim/read";
import { HEARD } from "../lib/sim/actions";
import {
  ExchangePhase,
  PHASE_EDGES,
  advance,
  isPhaseMoveAllowed,
  phaseBlock,
  phaseFromWorld,
} from "../lib/sim/exchange";
import { LANGUAGE_FUNCTIONS } from "../lib/sim/schema";
import { sayIn, REFUSAL_REASONS, INFO_KEYS } from "../lib/sim/say";
import { GOODS, goodById } from "../lib/sim/compile/goods";
import { NAME_POOL } from "../lib/sim/compile/compile";
import { bankFor, phrasesForErrand } from "../lib/sim/compile/phrasebank";
import { COMPILABLE_LANGUAGES } from "../lib/sim/compile/phrasebank";
import { SEED_DISTRICTS } from "../lib/game/districts";
import { looksLikeTargetScript } from "../lib/game/prompt";
import { HYDERABAD_STATION } from "../lib/sim/scenarios/hyderabad-station";
import { turnSystemPrompt, wantsOf } from "../lib/sim/prompt";
import { tuneScenario } from "../lib/sim/tune";
import { scoreRun } from "../lib/sim/score";
import { scoreAttempt } from "../lib/game/speech-score";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const fact = (key: string, value: Mutation extends never ? never : string | number | boolean | null): Mutation[] => [
  { kind: "fact", key, value },
];

console.log("\n1. scenario validates");
const issues = validateScenario(S);
check("no validation issues", issues.length === 0, issues.map((i) => `${i.path}: ${i.problem}`).join("; "));

console.log("\n2. opening state");
let state = openingState(S, "smoke-session");
const activeAtStart = Object.entries(state.missions).filter(([, s]) => s === "active");
check("two missions open at the start", activeAtStart.length === 2, activeAtStart.map(([id]) => id).join(","));
check("the bangles are locked behind finding them", state.missions["m3-bangles"] === "locked");
check("clock starts at 6:40pm", clockLabel(state.clock) === "6:40pm", clockLabel(state.clock));
check("wallet starts at 210", state.facts.wallet === 210);

// The one the architecture note asked for by name. A `failWhen` that holds at
// spawn auto-fails the run silently, in the code path nothing exercises.
const bornFailed = Object.values(settle(S, state).state.missions).filter((m) => m === "failed");
check("nothing is failed at the spawn point", bornFailed.length === 0, `${bornFailed.length} failed`);

console.log("\n3. reality is not negotiable");
const cheat = applyMutations(S, state, fact("floor.L1.tomato", 5));
check("a locked floor price cannot be mutated", cheat.state.facts["floor.L1.tomato"] === 32);
check("and the rejection is reported", cheat.rejected.length === 1, cheat.rejected[0]?.reason);
check("and it is in the log for the debrief to find",
  cheat.state.log.some((e) => e.kind === "reject"));

const invented = applyMutations(S, state, fact("price.L1.onion", 10));
check("an invented fact key is rejected", invented.rejected.length === 1, invented.rejected[0]?.reason);

const skipped = applyMutations(S, state, [{ kind: "mission", id: "m3-bangles", state: "complete" }]);
check("an unreachable mission cannot be completed", skipped.rejected.length === 1, skipped.rejected[0]?.reason);

console.log("\n4. missions complete from facts, not from a grader");
// Exactly what the action layer writes when `accept` fires below the opening.
state = applyMutations(S, state, [
  { kind: "fact", key: "wallet", value: 175 },
  { kind: "fact", key: "bag.tomato", value: 1 },
  { kind: "fact", key: "deal.L1.tomato.price", value: 35 },
  { kind: "fact", key: "bought.L1.tomato", value: true },
  { kind: "fact", key: "beat.L1.tomato", value: true },
]).state;
check("tomatoes still not complete until settle runs", state.missions["m1-tomatoes"] === "active");

let step = settle(S, state);
state = step.state;
check("settle completed it off the facts alone", state.missions["m1-tomatoes"] === "complete");
check("and paid the reward by arithmetic", state.facts.wallet === 205, `wallet ${state.facts.wallet}`);

console.log("\n5. the graph unlocks off a fact, not a sequence");
state = settle(S, applyMutations(S, state, fact("info.bangle_stall_location", true)).state).state;
check("asking where completed the ask mission", state.missions["m2-find-bangles"] === "complete");
check("which unlocked the bangles", state.missions["m3-bangles"] === "active");
check("and it is scored against Noor", missionFor(S, state, "noor")?.id === "m3-bangles");

console.log("\n6. two characters, one truth");
const lakshmiSees = S.characters.find((c) => c.id === "lakshmi")!.knows;
const noorSees = S.characters.find((c) => c.id === "noor")!.knows;
check("each vendor sees her own floor price",
  lakshmiSees.includes("floor.L1.tomato") && noorSees.includes("floor.R1.bangles"));
check("and neither sees the other's",
  !lakshmiSees.includes("floor.R1.bangles") && !noorSees.includes("floor.L1.tomato"));
check("no vendor is ever shown the player's wallet",
  !lakshmiSees.includes("wallet") && !noorSees.includes("wallet"));

console.log("\n7. the clock is the only way to fail");
const walletBefore = state.facts.wallet;
// 6:51pm — past nothing yet. rate is 3, so 660 real seconds is 33 in-world minutes.
const ticked = advanceClock(S, state, 60);
check("a tick does not fail anything", Object.values(ticked.state.missions).every((m) => m !== "failed"));
check("but it does move the clock", ticked.state.clock > state.clock);
check("and it bumps the version", ticked.state.version > state.version);

const late = advanceClock(S, state, 600); // +30 in-world minutes, past 7:00pm
check("past seven, the open mission fails", late.state.missions["m3-bangles"] === "failed");
check("completed missions are left alone", late.state.missions["m1-tomatoes"] === "complete");
check("and no reward was paid for failing", late.state.facts.wallet === walletBefore);

console.log("\n8. finishing the run");
state = settle(S, applyMutations(S, state, [
  { kind: "fact", key: "wallet", value: 25 },
  { kind: "fact", key: "bag.bangles", value: 1 },
  { kind: "fact", key: "deal.R1.bangles.price", value: 180 },
  { kind: "fact", key: "bought.R1.bangles", value: true },
  { kind: "fact", key: "beat.R1.bangles", value: true },
]).state).state;
check("bangles complete", state.missions["m3-bangles"] === "complete");
check("scenario complete", isComplete(S, state));
check("trajectory was logged", state.log.length > 10, `${state.log.length} events`);

/* ------------------------------------------------------------------ *
 * The action layer — the part the whole product's claim rests on
 * ------------------------------------------------------------------ */

console.log("\n9. a run cannot be completed in English");
let live = openingState(S, "act-session");
const lakshmi = missionFor(S, live, "lakshmi")!;

/** One `accept`, with a transcript and the model's read of it. */
const buy = (transcript: string, heard: Heard | null, state = live) =>
  resolveAct(
    { scenario: S, state, characterId: "lakshmi", mission: lakshmi, transcript, heard },
    { verb: "accept", target: "tomato", replyNative: "సరే, ఇదిగోండి." }
  );

// A price has to be on the table before anything can be accepted.
live = applyMutations(S, live, [{ kind: "fact", key: "rung.L1.tomato", value: 1 }]).state;

const silent = buy("", "silence");
check("accept with silence is refused", !silent.ok && silent.mutations.length === 0, silent.reason ?? "");

// The two halves of the gate, each tested with the other held favourable.
const english = buy("okay fine I will take one kilo", "accept");
check("English is refused even when the model says they agreed",
  !english.ok && english.reason === "not_the_language", english.reason ?? "");

const lying = buy("సరే, ఇస్తాను", "silence");
check("Telugu is refused when the model heard nothing",
  !lying.ok && lying.reason === "no_assent", lying.reason ?? "");

const wrongIntent = buy("కిలో ఎంత?", "ask");
check("a question does not authorise a purchase", !wrongIntent.ok, wrongIntent.reason ?? "");

// The failure everyone feared: Saaras rendering English in Telugu letters. The
// script check passes it, so the model's read is what has to catch it.
const transliterated = buy("ఓకే ఫైన్ ఐ విల్ టేక్ ఇట్", "english");
check("English transliterated into Telugu script is still refused", !transliterated.ok, transliterated.reason ?? "");

// And the point of the rewrite: this is NOT one of the mission's key phrases.
// The old gate refused it; a learner saying it out loud has plainly agreed.
const freehand = buy("అలాగే, ఒకటి ఇవ్వండి", "accept");
check("a sentence nobody authored is accepted when it is the language and it means yes",
  freehand.ok, freehand.reason ?? "");
check("and the engine did the arithmetic, not the model",
  freehand.mutations.some((m) => m.kind === "fact" && m.key === "wallet" && m.value === 175));

console.log("\n10. the floor is the floor");
const atFloor = applyMutations(S, live, [{ kind: "fact", key: "rung.L1.tomato", value: 2 }]).state;
const pushPast = resolveAct(
  { scenario: S, state: atFloor, characterId: "lakshmi", mission: lakshmi, transcript: "కొంచెం తగ్గించండి", heard: "haggle" },
  { verb: "concede", target: "tomato", replyNative: "సరే." }
);
check("the model cannot concede below the bottom rung", !pushPast.ok, pushPast.reason ?? "");
check("and the refusal is the authored line", pushPast.overrideReply === null, "concede is soft, so the line stands");

const brokePlayer = applyMutations(S, atFloor, [{ kind: "fact", key: "wallet", value: 10 }]).state;
const cantAfford = buy("సరే, ఇస్తాను", "accept", brokePlayer);
check("you cannot buy what you cannot afford", !cantAfford.ok && cantAfford.reason === "no_money");

console.log("\n11. information has to actually be said");
const askWhere = (reply: string) =>
  resolveAct(
    {
      scenario: S,
      state: live,
      characterId: "lakshmi",
      mission: S.missions.find((m) => m.id === "m2-find-bangles")!,
      transcript: "గాజుల దుకాణం ఎక్కడ?",
      heard: "ask",
      answerTokens: { bangle_stall: ["గాజుల"] },
    },
    { verb: "point", target: "bangle_stall", replyNative: reply }
  );

const vague = askWhere("అటువైపు వెళ్ళండి.");
check("pointing without naming the stall is refused", !vague.ok, vague.reason ?? "");
const named = askWhere("గాజుల దుకాణం అటు, కుడివైపు.");
check("naming it writes the fact", named.ok && named.mutations.length === 1, named.reason ?? "");

console.log("\n12. nobody is punished for speaking badly");
const clumsy = buy("ఎంత ఇస్తాను కిలో తగ్గించు", "unclear");
const cost = patienceCost(S, { ...live, turns: { lakshmi: 9 } }, "lakshmi", clumsy);
check("a turn of broken Telugu costs no patience", cost.length === 0 || cost.every((m) => m.kind !== "fact" || m.key !== "patience.lakshmi"),
  JSON.stringify(cost));
// "Not punished" means the stakes do not move and the world still opens to
// them — NOT that broken Telugu is credited as a language function learnt.
// Those are different claims and they want different thresholds: assent is
// forgiving at 0.40 so the conversation keeps going, crediting is strict at
// 0.72 so "you can do this" means something. This test used to assert the
// second and was really testing the first.
check("and a half-right sentence still clears the gate when it is the language",
  assent(S, "accept", "సరే ఇస్తాను కొంచెం", "accept").ok);
check("but a garbled one is not credited as a function learnt",
  clumsy.produced.length === 0, clumsy.produced.join(","));

console.log("\n13. the same errand is not the same conversation twice");
const cold = chooseObstacles(S, {}, 0).map((c) => c.obstacle.id);
check("a learner with no history gets an obstacle per mission", cold.length === S.missions.length, cold.join(","));
check("and no two missions drill the same function",
  new Set(chooseObstacles(S, {}, 0).map((c) => c.obstacle.drills)).size === cold.length);

// Someone who has greeted people twenty times and never once clarified.
const practised = chooseObstacles(S, { greet: 20, negotiate: 14, ask_price: 18 }, 0);
check("a learner who has drilled greeting to death is not given it again",
  !practised.some((c) => c.obstacle.drills === "greet"),
  practised.map((c) => `${c.obstacle.id}:${c.obstacle.drills}`).join(", "));

check("two runs with the same history still differ",
  chooseObstacles(S, {}, 0).map((c) => c.obstacle.id).join() !==
    chooseObstacles(S, {}, 3).map((c) => c.obstacle.id).join(),
  `${chooseObstacles(S, {}, 0).map((c) => c.obstacle.id).join()} vs ${chooseObstacles(S, {}, 3).map((c) => c.obstacle.id).join()}`);

const dressed = applyObstacles(S, practised);
check("an obstacle can only ever ADD ways to satisfy assent",
  dressed.missions.every((m, i) => S.missions[i].keyPhrases.every((p) => m.keyPhrases.includes(p))));
check("and the dressed scenario still validates", validateScenario(dressed).length === 0,
  validateScenario(dressed).map((i) => `${i.path}: ${i.problem}`).join("; "));

// An obstacle that tried to rewrite the physics would be stopped anyway, but
// it should not be trying: nothing in the deck may touch a locked fact.
const setupRejects = applyMutations(S, openingState(S, "obs"), obstacleSetup(chooseObstacles(S, {}, 1))).rejected;
check("no obstacle proposes a write the engine has to refuse", setupRejects.length === 0,
  setupRejects.map((r) => r.reason).join("; "));

console.log("\n14. the band actually bends the run");
for (const d of ["beginner", "intermediate", "advanced"] as const) {
  const run = tuneScenario(S, d, {}, 2);
  const wallet = Number(run.scenario.facts.find((f) => f.key === "wallet")!.value);
  const minutes = run.scenario.stakes.deadlineMinutes - run.scenario.clock.startMinutes;
  console.log(
    `  ${d.padEnd(13)} ${run.scenario.missions.length} errands · ₹${wallet} · ${minutes}min · ` +
      `assent ${run.scenario.stakes.assentThreshold} · ${run.obstacles.length} obstacle(s)`
  );
  check(`${d} validates`, validateScenario(run.scenario).length === 0,
    validateScenario(run.scenario).map((i) => `${i.path}: ${i.problem}`).join("; "));
  check(`${d} opens without failing anything`,
    Object.values(settle(run.scenario, openingState(run.scenario, "b")).state.missions).every((m) => m !== "failed"));
}

const easy = tuneScenario(S, "beginner", {}, 2);
const hard = tuneScenario(S, "advanced", {}, 2);
const walletOf = (r: ReturnType<typeof tuneScenario>) =>
  Number(r.scenario.facts.find((f) => f.key === "wallet")!.value);
check("hard gives more errands than easy", hard.scenario.missions.length > easy.scenario.missions.length);

// Not the absolute wallet — hard has MORE errands, so its floors sum higher and
// its wallet is the larger number. What tightens is the MARGIN over what the
// run costs at rock bottom, which is the thing the player actually feels.
const marginOf = (r: ReturnType<typeof tuneScenario>) => {
  const floors = r.scenario.missions.reduce((sum, m) => {
    const t = m.template;
    if (t.kind !== "buy") return sum;
    return sum + Number(r.scenario.facts.find((f) => f.key === `floor.${t.slot}.${t.item}`)?.value ?? 0) * t.qty;
  }, 0);
  return floors ? walletOf(r) / floors : Infinity;
};
check("hard leaves far less slack over the floor prices",
  marginOf(hard) < marginOf(easy),
  `easy ×${marginOf(easy).toFixed(2)} vs hard ×${marginOf(hard).toFixed(2)}`);
check("hard gives less time than easy",
  hard.scenario.stakes.deadlineMinutes < easy.scenario.stakes.deadlineMinutes);
check("easy puts nothing in the way", easy.obstacles.length === 0);
check("hard puts two things in the way", hard.obstacles.length === 2,
  hard.obstacles.map((o) => o.obstacle.id).join(","));

console.log("\n15. the score is arithmetic, and the gates are ceilings");
const scored = openingState(S, "score");
const emptyRun = scoreRun(S, scored);
check("a run with no turns scores zero", emptyRun.total === 0, String(emptyRun.total));
check("and says why", !!emptyRun.cappedBy, emptyRun.cappedBy ?? "");

// Someone who clicked through in English: turns happened, none in Telugu.
const englishRun = {
  ...scored,
  history: Array.from({ length: 6 }, (_, i) => ({
    n: i + 1, clock: 1120, characterId: "lakshmi", input: "text" as const,
    said: `just give me the tomatoes number ${i}`, tokens: 6, sttOk: true, silent: false,
    assent: null, distinctContent: true, act: "greet", rejected: null, nullTurn: false,
  })),
};
const eng = scoreRun(S, englishRun);
check("a run played in English is capped at 25", eng.total !== null && eng.total <= 25, String(eng.total));

// A reciter: same sentence every turn, and it IS Telugu.
const reciterRun = {
  ...scored,
  history: Array.from({ length: 6 }, (_, i) => ({
    n: i + 1, clock: 1120, characterId: "lakshmi", input: "voice" as const,
    said: "కిలో ఎంత?", tokens: 2, sttOk: true, silent: false,
    assent: { phraseId: "p_price", accuracy: 1 }, distinctContent: i === 0,
    act: "greet", rejected: null, nullTurn: false,
  })),
};
const rec = scoreRun(S, reciterRun);
check("a reciter is capped for repeating themselves", rec.total !== null && rec.total <= 40,
  `${rec.total} — ${rec.cappedBy}`);

// The venue-wifi run: most turns unheard.
const deafRun = {
  ...scored,
  history: Array.from({ length: 6 }, (_, i) => ({
    n: i + 1, clock: 1120, characterId: "lakshmi", input: "voice" as const,
    said: "", tokens: 0, sttOk: i === 0, silent: true,
    assent: null, distinctContent: false, act: null, rejected: null, nullTurn: false,
  })),
};
check("a run we could not hear gets no score at all, rather than a zero",
  scoreRun(S, deafRun).total === null);

console.log("\n16. a half-right sentence is worth half, not nothing");
const halfRun = {
  ...openingState(S, "half"),
  history: [
    // "kilo enta?" is the price question said almost right — one word of two.
    { n: 1, clock: 1120, characterId: "lakshmi", input: "voice" as const,
      said: "కిలో", tokens: 1, sttOk: true, silent: false,
      assent: null, distinctContent: true, act: null, rejected: null, nullTurn: false },
  ],
};
const half = scoreRun(S, halfRun);
check("a partial attempt is not scored as silence",
  half.counts.phrasesHit + 0 >= 0 && half.total !== null, String(half.total));
check("and the run score is above a run with nothing said",
  (half.total ?? 0) > (scoreRun(S, openingState(S, "none")).total ?? 0),
  `${half.total} vs ${scoreRun(S, openingState(S, "none")).total}`);

// The bands the panel paints and the bands the scorer counts must agree about
// what "got it" means, or a green dot can still score zero.
const perfect = scoreAttempt(S.phrases[1].native, S.phrases[1].native);
check("a word-perfect line is green by speech-score's own threshold",
  perfect.accuracy >= 0.72, perfect.accuracy.toFixed(2));

console.log("\n17. you may say it your own way");
{
  // The whole point of taking the checklist out. None of these three is an
  // authored phrase, all three are plainly Telugu, and all three plainly mean
  // yes. The old gate refused every one of them.
  const ownWords = [
    "అలాగే, ఒకటి ఇవ్వండి",
    "తీసుకుంటాను, ప్యాక్ చేయండి",
    "పర్వాలేదు, ఇవ్వండి",
  ];
  const authored = new Set(S.phrases.map((p) => p.native));
  for (const line of ownWords) {
    check(`"${line}" is accepted`, assent(S, "accept", line, "accept").ok);
    check("  and nobody wrote it down", !authored.has(line));
  }

  // What the rewrite did NOT give up.
  check("English still cannot buy anything",
    assent(S, "accept", "yes okay give me one", "accept").reason === "not_the_language");
  check("nor can silence", !assent(S, "accept", "", "accept").ok);
  check("nor can Telugu the model did not hear as agreement",
    !assent(S, "accept", "సరే, ఇస్తాను", "unclear").ok);
  check("a question is not a purchase",
    assent(S, "accept", "కిలో ఎంత?", "ask").reason === "wrong_intent");

  // Verbs the world owns outright are not gated on speech at all — the vendor
  // quoting a price is the engine's business, not the learner's.
  check("the vendor may always quote", assent(S, "quote", "", null).ok);
}

console.log("\n18. a turn is worth what it did, not what it matched");
{
  const t = (over: Partial<Parameters<typeof scoreTurn>[0]>) =>
    scoreTurn({
      heard: "ask",
      landed: true,
      accuracy: 0,
      fresh: false,
      inLanguage: true,
      languageLabel: "Telugu",
      ...over,
    });

  // The promise, at the top of the scorer where it cannot be argued with.
  check("English is worth nothing however fluent", t({ heard: "english" }).points === 0);
  check("and so is silence", t({ heard: "silence" }).points === 0);
  check("and so is a sentence that was not in the script at all",
    t({ inLanguage: false }).points === 0);
  check("but a sentence nobody could follow is not nothing",
    t({ heard: "unclear" }).points === 20);

  // The bug this replaced: an unauthored sentence scored as its edit distance
  // to whichever phrase the card happened to be showing, which was ~18%.
  const ownWords = t({ accuracy: 0.2, fresh: true });
  check("saying it your own way clears seventy", ownWords.points >= 70, String(ownWords.points));
  check("and reciting the phrase perfectly is still worth more",
    t({ accuracy: 1, fresh: true }).points > ownWords.points);
  check("a hundred is reachable", t({ accuracy: 1, fresh: true }).points === 100);
  check("speaking well at somebody who could not act on it is worth less",
    t({ accuracy: 1, fresh: true, landed: false }).points === 85);
  check("nothing ever exceeds a hundred", t({ accuracy: 1, fresh: true }).points <= 100);
}

console.log("\n19. the ledger counts what you did, not what you quoted");
{
  // Measured on the first live free-speech run: an ordinary way to ask a price
  // that scores 0.48 against the authored phrase, and used to credit nothing.
  const ownAsk = "టమాటా ధర ఎంత చెప్పండి";
  check("the phrase bank alone credits nothing for it",
    producedFunctions(S, ownAsk).length === 0);
  check("the model's read credits asking a price",
    producedFunctions(S, ownAsk, "ask").includes("ask_price"));
  check("and the same question answered with directions is a question about a place",
    producedFunctions(S, ownAsk, "ask", "point").includes("ask_location"));
  check("an authored phrase still credits what it drills",
    producedFunctions(S, "కొంచెం తగ్గించండి", "haggle").includes("negotiate"));
  check("agreeing is not double-paid as a language function",
    producedFunctions(S, "అలాగే", "accept").length === 0);
  check("silence credits nothing", producedFunctions(S, "   ", "greet").length === 0);
}

console.log("\n20. she has her own half of the conversation");
{
  let w = openingState(S, "wants");
  const before = wantsOf(S, w, "lakshmi");
  check("before a price she wants to know what you are after",
    before.some((l) => l.includes("what this customer actually wants")));

  w = applyMutations(S, w, [{ kind: "fact", key: "rung.L1.tomato", value: 0 }]).state;
  const priced = wantsOf(S, w, "lakshmi");
  check("once a price is named she wants a quantity",
    priced.some((l) => l.includes("HOW MUCH")));

  w = applyMutations(S, w, [{ kind: "fact", key: "bought.L1.tomato", value: true }]).state;
  w = settle(S, w).state;
  const done = wantsOf(S, w, "lakshmi");
  check("and once it is sold she does not try to sell it again",
    !done.some((l) => l.includes("HOW MUCH")));

  // The reason two runs are not the same conversation.
  const turnTwo = { ...openingState(S, "t"), turns: { lakshmi: 2 } };
  check("small talk is drawn by the seed",
    wantsOf(S, turnTwo, "lakshmi", 1).join() !== wantsOf(S, turnTwo, "lakshmi", 2).join());
  check("and there is none of it before you have said a word",
    wantsOf(S, openingState(S, "t"), "lakshmi", 1).length ===
      wantsOf(S, openingState(S, "t"), "lakshmi", 2).length);
}

console.log("\n21. somebody else is standing there");
{
  const sarala = S.characters.find((c) => c.id === "sarala")!;
  check("the woman in the queue is a bystander", sarala.bystander === true);
  check("and she owns nothing at all", sarala.knows.length === 0);
  check("she is never given a body to walk up to",
    !bindingFor(S).cast.some((c) => c.id === "sarala"));

  // The band is the only thing that decides whether she is there.
  const hardRun = tuneScenario(S, "advanced", {}, 1);
  const midRun = tuneScenario(S, "intermediate", {}, 1);
  check("she stands in the exchange on hard",
    (hardRun.scenario.missions[0].companions ?? []).includes("sarala"));
  check("and nowhere below it",
    (midRun.scenario.missions[0].companions ?? []).length === 0);

  // A companion who could sell you something would be a second vendor with no
  // ladder behind them, which is a hole straight through the whole argument.
  const forged = {
    ...S,
    missions: S.missions.map((m, i) => (i === 0 ? { ...m, companions: ["noor"] } : m)),
  };
  check("a real vendor cannot be conscripted as a bystander",
    validateScenario(forged).some((v) => v.problem.includes("not a bystander")),
    JSON.stringify(validateScenario(forged)));

  const ghost = {
    ...S,
    missions: S.missions.map((m, i) => (i === 0 ? { ...m, companions: ["nobody"] } : m)),
  };
  check("nor can somebody who does not exist",
    validateScenario(ghost).some((v) => v.problem.includes('no character "nobody"')));
}

console.log("\n22. she cannot ask for money nobody is charging");
{
  const prices = ladderNumbers(openingState(S, "p"), S.characters[0]);
  check("she knows her own ladder", prices.has(40) && prices.has(32), [...prices].join());

  // The line measured out of the live route, two turns after the sale closed.
  const phantom = "సరే, ఇవ్వండి ₹70. ప్యాక్ చేశాను, ఇదీ.";
  const cleaned = dropPhantomPrice(phantom, prices);
  check("a total nobody was charged is dropped", !cleaned.includes("70"), cleaned);
  check("and the rest of the sentence survives", cleaned.includes("ప్యాక్"), cleaned);

  check("a re-quote off her own ladder goes too",
    !dropPhantomPrice("కిలోకి 40 అంటే 40.", prices).includes("40"));

  // The reason the test is the rupee sign and not the digits.
  const platform = "మూడో ప్లాట్‌ఫారం, అటు వైపు.";
  check("a platform number is not a price",
    dropPhantomPrice(platform, prices) === platform);
  check("and neither is a number nobody sells at",
    dropPhantomPrice("ఆరు గంటలకి 6 కి మూసేస్తాం.", prices).includes("6"));

  check("a vendor is never struck silent",
    dropPhantomPrice("₹70.", prices).length > 0);
  // Somebody with no ladder at all has even less business naming a price.
  check("and a character with no prices at all still cannot name one",
    !dropPhantomPrice("₹70 ఇవ్వండి.", new Set()).includes("70"));
  check("but she still says something",
    dropPhantomPrice("₹70 ఇవ్వండి.", new Set()).includes("ఇవ్వండి"));
}

console.log("\n23. a run in your own words is not a run you failed");
{
  // Five turns of ordinary Telugu, none of it in the phrase bank, every errand
  // finished. Under the old scorer this was capped at 40 with the sentence "you
  // did not land any of the phrases this errand needed", which is the checklist
  // outliving the checklist.
  const ownWords = {
    ...openingState(S, "own"),
    missions: Object.fromEntries(S.missions.map((m) => [m.id, "complete" as const])),
    history: [
      "నమస్కారం అమ్మా, ఎలా ఉన్నారు?",
      "టమాటా ధర ఎంత చెప్పండి",
      "అబ్బా, అంత ఇవ్వలేను, కొంచెం తగ్గించండి",
      "ఒక కిలో చాలు, ప్యాక్ చేయండి",
      "గాజులు ఎక్కడ దొరుకుతాయి?",
    ].map((said, i) => ({
      n: i + 1, clock: 1120, characterId: "lakshmi", input: "voice" as const,
      said, tokens: said.split(" ").length, sttOk: true, silent: false,
      assent: null, distinctContent: true, act: "greet", rejected: null,
      nullTurn: false, points: 85,
    })),
  };
  const own = scoreRun(S, ownWords);
  check("it is not capped for missing the phrase bank", own.cappedBy === null,
    own.cappedBy ?? "");
  check("and it scores like the good run it was", (own.total ?? 0) >= 70, String(own.total));
  check("the debrief can say they spoke the language every turn",
    own.counts.assentTurns === 5, String(own.counts.assentTurns));

  // The ceiling that replaced it: speech that did not get through.
  const mumbling = {
    ...ownWords,
    history: ownWords.history.map((t) => ({ ...t, points: 15 })),
  };
  const mum = scoreRun(S, mumbling);
  check("but speech nobody understood is still capped", (mum.total ?? 100) <= 40,
    `${mum.total} — ${mum.cappedBy}`);
  check("and it says so in terms of the language, not the phrase list",
    !!mum.cappedBy && !mum.cappedBy.includes("phrase"), mum.cappedBy ?? "");

  // Runs recorded before the per-turn scorer existed still score the old way.
  const legacy = {
    ...ownWords,
    history: ownWords.history.map(({ points, ...rest }) => rest),
  };
  check("a run from before any of this still scores", scoreRun(S, legacy).total !== null);
}

console.log("\n24. the suggestion answers what she just did");
{
  const w = openingState(S, "coach");
  const m1 = missionFor(S, w, "lakshmi")!;
  // The act LANDED unless a test says otherwise. A refused one is a different
  // conversation and section 26 is about that.
  const at = (verb: Verb | null, state = w) =>
    coachFor(S, state, m1, verb ? { verb, ok: true } : null);
  // A price on the table, which most of the advice below only makes sense with.
  const priced = applyMutations(S, w, [{ kind: "fact", key: "rung.L1.tomato", value: 0 }]).state;

  check("before anybody has spoken, it opens with hello", at(null).say?.id === "p_greet");
  check("after she greets you, it stops saying hello",
    at("greet").say?.drills !== "greet", at("greet").say?.id ?? "-");
  check("and asks her something instead",
    ["ask_price", "ask_location"].includes(at("greet").say?.drills ?? ""), at("greet").say?.id ?? "-");
  check("after she names a price, it pushes back",
    at("quote", priced).say?.drills === "negotiate", at("quote", priced).say?.id ?? "-");
  check("after she comes down, it closes",
    at("concede", priced).say?.drills === "specify_quantity",
    at("concede", priced).say?.id ?? "-");
  check("after she mishears you, it offers 'say it again'",
    at("clarify").say?.drills === "clarify", at("clarify").say?.id ?? "-");
  const told = applyMutations(S, w, [
    { kind: "fact", key: "info.bangle_stall_location", value: true },
  ]).state;
  const m2 = S.missions.find((m) => m.id === "m2-find-bangles")!;
  check("after she answers you, it thanks her",
    coachFor(S, told, m2, { verb: "tell", ok: true }).say?.drills === "thank",
    coachFor(S, told, m2, { verb: "tell", ok: true }).say?.id ?? "-");

  // The old rule, demoted to a tie-break — but a tie-break with room to work.
  // "Come down a little" and "that is too much" both answer a quote; a learner
  // who has haggled the same way nine times is handed the other way.
  const practised = { ...priced, functions: { negotiate: 9 } };
  check("among things that all work, the coldest one wins",
    at("quote", practised).say?.drills !== "negotiate",
    at("quote", practised).say?.id ?? "-");
  check("and it is still something that answers a quote",
    ["refuse", "specify_quantity", "compare"].includes(at("quote", practised).say?.drills ?? ""),
    at("quote", practised).say?.id ?? "-");

  check("the alternatives are never the same advice twice",
    new Set(at("quote", priced).also.map((p) => p.drills)).size ===
      at("quote", priced).also.length);
  check("and never repeat the headline",
    !at("quote", priced).also.some((p) => p.drills === at("quote", priced).say?.drills));
  check("there is always something to say", at("end").say !== null);
  check("and it always says why", at("quote").because.length > 0);

  // Nothing here may be model-written: every suggestion comes off the bank.
  const ids = new Set(S.phrases.map((p) => p.id));
  for (const act of ["greet", "quote", "concede", "clarify", "tell", "accept"] as const) {
    const c = at(act, priced);
    if (!ids.has(c.say?.id ?? "")) check(`${act}: the suggestion is an authored phrase`, false);
  }
  check("every suggestion is an authored phrase", true);
}

console.log("\n25. every line she says comes with its meaning");
{
  // The romanisation tells you how to SAY it. Only this tells you what it was.
  for (const reason of ["below_floor", "no_money", "no_stock", "not_the_language", "dont_know"]) {
    check(`the engine's "${reason}" refusal has a meaning`,
      refusalMeaning(reason).length > 0 && refusalMeaning(reason) !== refusalMeaning("zzz"),
      refusalMeaning(reason));
  }
  check("an unknown reason still says something", refusalMeaning("zzz").length > 0);

  // Refusals are fixed strings, so their translations belong in the catalogue
  // rather than in a model call — which only works if they are English here.
  check("and they are written in English, for `gloss` to translate",
    /^[ -~]+$/.test(refusalMeaning("no_money")), refusalMeaning("no_money"));
}

console.log("\n26. the advice answers what she actually said");
{
  // THE BUG. The model proposed `accept`, the engine refused it for want of
  // assent, threw the model's words away and had her say "what did you say? say
  // it again" — and the card underneath read "It is done. Thank her."
  const w = openingState(S, "refused");
  const m1 = missionFor(S, w, "lakshmi")!;
  const priced = applyMutations(S, w, [{ kind: "fact", key: "rung.L1.tomato", value: 0 }]).state;

  const asProposed = coachFor(S, priced, m1, { verb: "accept", ok: true });
  const asHappened = coachFor(S, priced, m1, { verb: "accept", ok: false, reason: "no_assent" });
  check("a refused acceptance is not coached as an acceptance",
    asHappened.say?.id !== asProposed.say?.id,
    `${asProposed.say?.id} vs ${asHappened.say?.id}`);
  check("and it does not tell you to thank her for nothing",
    asHappened.say?.drills !== "thank", asHappened.say?.id ?? "-");
  check("it says what went wrong instead",
    asHappened.because.includes("did not follow"), asHappened.because);
  check("and points at what the errand still needs",
    ["negotiate", "specify_quantity", "refuse"].includes(asHappened.say?.drills ?? ""),
    asHappened.say?.id ?? "-");

  // Even when the act LANDS, the world gets a veto. Nothing has been bought.
  check("thanks is never offered before anything has been handed over",
    coachFor(S, priced, m1, { verb: "accept", ok: true }).say?.drills !== "thank",
    coachFor(S, priced, m1, { verb: "accept", ok: true }).say?.id ?? "-");
  check("and haggling is never offered before a price exists",
    !["negotiate", "refuse", "compare", "specify_quantity"].includes(
      coachFor(S, w, m1, { verb: "greet", ok: true }).say?.drills ?? ""
    ), coachFor(S, w, m1, { verb: "greet", ok: true }).say?.id ?? "-");

  // Once it IS bought, thanking is exactly right.
  const done = applyMutations(S, priced, [
    { kind: "fact", key: "bought.L1.tomato", value: true },
  ]).state;
  check("once it is bought, thanking is what is offered",
    coachFor(S, done, m1, { verb: "accept", ok: true }).say?.drills === "thank",
    coachFor(S, done, m1, { verb: "accept", ok: true }).say?.id ?? "-");

  // Each refusal reason gets its own answer, and none of them is silence.
  for (const reason of ["no_money", "no_stock", "not_mine", "below_floor", "not_the_language"]) {
    const c = coachFor(S, priced, m1, { verb: "accept", ok: false, reason });
    check(`"${reason}" is answered with something to say`, !!c.say && c.because.length > 0,
      `${c.say?.id} — ${c.because}`);
  }
  check("an unknown reason still gives advice",
    !!coachFor(S, priced, m1, { verb: "accept", ok: false, reason: "zzz" }).say);
}

console.log("\n27. a greeting is answered, not refused");
{
  // Measured: a clean 75% "namaskaram" was met with the engine refusal "what
  // did you say? say it again", because the model heard a greeting and reached
  // for `accept` anyway. The extraction is the trustworthy field, so the act is
  // brought into line with it instead of the turn being thrown away.
  check("hearing hello turns a grab for the goods into a greeting",
    settleVerb("accept", "greet") === "greet");
  // NOT `clarify`. Measured: a clean price question at 80% was answered with
  // "what did you say? say it again", twice running, because the model reached
  // for `accept` and the repair punished the choice instead of answering the
  // customer. A question gets a price.
  check("a question gets answered rather than punished",
    settleVerb("accept", "ask") === "quote");
  check("unless there is nothing for sale, and then it is just talking",
    settleVerb("accept", "ask", false) === "greet");
  check("a claim to have told them something they did not ask becomes a greeting",
    settleVerb("tell", "greet") === "greet");
  check("and an answer to nobody becomes 'I did not catch that'",
    settleVerb("point", "accept") === "clarify");
  check("something nobody could follow is the one case that really is clarify",
    settleVerb("accept", "unclear") === "clarify" &&
      settleVerb("accept", "silence") === "clarify");

  // It must never do the opposite: this is a way OUT of acts, never into them.
  check("an act its own extraction supports is untouched",
    settleVerb("accept", "accept") === "accept" && settleVerb("tell", "ask") === "tell");
  // NOT haggling. "Come down a little" is not "I will take it", and treating
  // it as one collapsed a whole sale into one turn.
  check("pushing back on the price is not agreeing to it",
    settleVerb("accept", "haggle") !== "accept");
  check("it is a reason for her to come down",
    settleVerb("accept", "haggle") === "concede");
  check("verbs the world owns outright are never rewritten",
    settleVerb("quote", "greet") === "quote" && settleVerb("concede", "silence") === "concede");
  check("and with no extraction at all nothing is assumed",
    settleVerb("accept", null) === "accept");

  // The gate still runs afterwards, so silence buys nothing by this route.
  const w = applyMutations(S, openingState(S, "settle"), [
    { kind: "fact", key: "rung.L1.tomato", value: 1 },
  ]).state;
  const m1 = missionFor(S, w, "lakshmi")!;
  const sneaky = resolveAct(
    { scenario: S, state: w, characterId: "lakshmi", mission: m1,
      transcript: "namaskaram", heard: "greet" },
    { verb: settleVerb("accept", "greet"), target: "tomato", replyNative: "సరే." }
  );
  check("a downgraded act writes nothing anybody could want",
    sneaky.ok && !sneaky.mutations.some((m) => m.kind === "fact" && m.key === "wallet"),
    JSON.stringify(sneaky.mutations));
}

console.log("\n28. she knows the way, and the conversation ends");
{
  // She was asked where the bangle stall was and told only "you know where the
  // bangle stall is — not yet", which is a fact about the CUSTOMER. So she
  // invented: "Sarala is right next door", Sarala being the woman in the queue.
  const where = S.facts.find((f) => f.key === "info.bangle_stall_location")!;
  check("the fact carries the answer she is supposed to give", !!where.answer, where.answer ?? "-");
  check("and the tokens her reply has to contain", (where.answerTokens ?? []).length > 0);
  check("the answer contains its own tokens",
    (where.answerTokens ?? []).some((t) => where.answer!.includes(t)));

  // `answerTokens` has been in `ActContext` since the action layer was written
  // and no caller passed it, so `tell` took the model's word for it.
  const w = openingState(S, "tell");
  const m2 = S.missions.find((m) => m.id === "m2-find-bangles")!;
  const told = (reply: string) =>
    resolveAct(
      {
        scenario: S, state: w, characterId: "lakshmi", mission: m2,
        transcript: "గాజుల దుకాణం ఎక్కడ?", heard: "ask",
        answerTokens: { bangle_stall_location: where.answerTokens! },
      },
      { verb: "tell", target: "bangle_stall_location", replyNative: reply }
    );
  check("a reply that carries the answer lands", told(where.answer!).ok);
  check("and one that does not is refused",
    !told("సరళ అక్కడ పక్కన ఉంది.").ok, told("సరళ అక్కడ పక్కన ఉంది.").reason ?? "-");

  // The end of a conversation, scored on its own.
  const history = [
    { characterId: "lakshmi", said: "నమస్కారం", points: 85, nullTurn: false },
    { characterId: "lakshmi", said: "కొంచెం తగ్గించండి", points: 100, nullTurn: false },
    { characterId: "noor", said: "ఇది ఎంత?", points: 20, nullTurn: false },
    { characterId: "lakshmi", said: "", points: 0, nullTurn: true },
  ];
  const conv = conversationScore(history, "lakshmi");
  check("a conversation is scored on its own turns", conv.turns === 2, String(conv.turns));
  check("nobody else's turns count", conv.points === 93, String(conv.points));
  check("and it shows them their best line",
    conv.best?.said === "కొంచెం తగ్గించండి", conv.best?.said ?? "-");
  check("a conversation with nothing in it does not divide by zero",
    conversationScore([], "lakshmi").points === 0);

  // And with the errand settled and nothing else owed, thanking her is not
  // vetoed for want of something to be thankful for.
  const settledUp = applyMutations(S, openingState(S, "bye"), [
    { kind: "fact", key: "info.bangle_stall_location", value: true },
  ]).state;
  check("once there is no errand left, thanking her is the advice",
    coachFor(S, settledUp, null, { verb: "tell", ok: true }).say?.drills === "thank",
    coachFor(S, settledUp, null, { verb: "tell", ok: true }).say?.id ?? "-");
}

console.log("\n29. the suggestion she writes is checked before it is taught");
{
  const inScript = (t: string) => /[ఀ-౿]/.test(t);
  const vet = (
    line: { native?: string; roman?: string; meaning?: string; move?: string },
    over: Partial<Parameters<typeof vetCoachLine>[1]> = {}
  ) =>
    vetCoachLine(line, {
      script: "Telugu",
      saidByThem: "కిలోకి ₹40.",
      saidByYou: "కిలో ఎంత?",
      stale: false,
      example: "",
      wants: [],
      inScript: (t) => inScript(t),
      ...over,
    });

  const good = { native: "చాలా ఎక్కువగా ఉంది", roman: "chaala ekkuvagaa undi", meaning: "that is too expensive" };
  check("a good line is taught", !!vet(good));
  check("with its meaning", vet(good)?.en === "that is too expensive");

  check("English is not taught", !vet({ ...good, native: "that is too expensive" }));
  // Measured on a Marathi card: "तुम्ही किती cobrar करता?" — the Spanish for
  // "charge", wedged into a sentence that was otherwise fine, and waved through
  // because the script check only asks whether ANY Devanagari is present.
  check("nor is a sentence with one foreign word wedged into it",
    !vet({ ...good, native: "చాలా cobrar ఉంది" }));
  check("but a price in it is fine", !!vet({ ...good, native: "₹40 చాలా ఎక్కువ" }));

  // Several languages were handing back two-word cards while Hindi got a whole
  // sentence, because the only worked example in the prompt was Telugu. The
  // model has to say MORE than the phrasebook entry it was shown.
  check("a card no longer than the entry it was told to expand is refused",
    !vet({ ...good, native: "ఎంత?" }, { example: "కిలో ఎంత?" }));
  check("and one that actually expands it is taught",
    !!vet({ ...good, native: "అమ్మా, అంత ఇవ్వలేను, కొంచెం తగ్గించండి" }, { example: "కిలో ఎంత?" }));
  check("nor is a line with no meaning", !vet({ ...good, meaning: "" }));
  check("nor a paragraph", !vet({ ...good, native: "ఎక్కువ ".repeat(40) }));
  // But a whole sentence fits now, which is the point of the ceiling moving.
  check("a real sentence somebody would actually say does fit",
    !!vet({ ...good, native: "అమ్మా, అంత ఇవ్వలేను, కొంచెం తగ్గించండి." }));
  check("nor nothing at all", !vet({ ...good, native: "   " }));

  // Both echoes, each measured off the live route.
  check("it never tells you to repeat what she just said",
    !vet({ ...good, native: "కిలోకి ₹40." }));
  check("nor to repeat what you just said yourself",
    !vet({ ...good, native: "కిలో ఎంత?" }));
  check("and whitespace does not disguise an echo",
    !vet({ ...good, native: " కిలో  ఎంత? " }));

  // Written before the act resolved, and the act ended the errand.
  check("advice for a world that has moved on is dropped",
    !vet(good, { stale: true }));

  // THE MOVE IT NAMES HAS TO BE THE MOVE THE TURN CALLS FOR.
  //
  // Measured: told to push back on a ₹40 quote it wrote "that is very fair,
  // thank you" — good Telugu, and it accepts the price it was sent to argue
  // with. Prose did not hold it; set membership does.
  const wants = ["negotiate", "specify_quantity", "refuse"];
  check("a sentence that makes the right move is taught",
    !!vet({ ...good, move: "negotiate" }, { wants }));
  check("one that thanks her for the price she just named is not",
    !vet({ native: "చాలా సరైంది, ధన్యవాదాలు.", roman: "chaala saraindi", meaning: "that is very fair, thank you", move: "thank" }, { wants }));
  check("and one that names no move at all is not",
    !vet(good, { wants }));
  check("with nothing in particular called for, any move is fine",
    !!vet({ ...good, move: "thank" }, { wants: [] }));
}

console.log("\n30. everybody is standing in the same world");
{
  // She sent a customer to the bangle seller for tomatoes and said she had none
  // left, with four kilos on the stall and the fact in her own prompt. Nothing
  // had ever told her what the world was — her prompt was six unrelated lists,
  // not one of which said what anybody else in the lane sold.
  const lakshmi = S.characters.find((c) => c.id === "lakshmi")!;
  const noor = S.characters.find((c) => c.id === "noor")!;
  const brief = worldBrief(S, lakshmi);

  for (const c of S.characters) {
    check(`the brief names ${c.id}`, brief.includes(c.name));
  }
  check("it says what the OTHER trader sells", brief.includes("bangles"));
  check("and marks the bystander as selling nothing",
    (brief.split("\n").find((l) => l.includes("సరళ")) ?? "").includes("selling nothing"),
    brief.split("\n").find((l) => l.includes("సరళ")) ?? "-");
  check("the character can find themselves in it", brief.includes("(you)"));
  check("and the rule that follows is spelled out",
    brief.includes("Nobody has anything that is not on their own line"));

  // The player's wallet and shopping list are the player's.
  check("the premise is not pasted in", !brief.includes(S.premise));
  check("so a vendor is never told what is in the customer's pocket",
    !brief.includes("₹210"));

  // Same function, different cast, no special cases.
  const station = HYDERABAD_STATION;
  const clerk = worldBrief(station, station.characters[0]);
  check("a one-person world still gets a brief", clerk.includes("ticket"));
  check("and a character who knows nothing is told so",
    clerk.includes("Nothing beyond your own stall"));

  // The answer she holds travels with the brief now.
  check("what she knows is a sentence she can say, not a key",
    worldBrief(S, lakshmi).includes("గాజుల దుకాణం ఈ సందు చివర"));
  check("and Noor, who knows nothing, is told nothing",
    worldBrief(S, noor).includes("Nothing beyond your own stall"));
}

console.log("\n31. every language the product ships is actually finished");
{
  // Somebody opened Amritsar and the Punjabi shopkeeper said "आइए, क्या चाहिए?".
  // Three tables covered Telugu, Hindi and Tamil and fell back to Hindi for the
  // other seven, and because the only worlds anybody played were Telugu it went
  // unnoticed for the length of the branch. This section is the reason it
  // cannot: it walks every language the compiler will accept and refuses any
  // whose engine lines are not in its own script.
  for (const language of COMPILABLE_LANGUAGES) {
    const district = SEED_DISTRICTS.find((d) => d.language === language);
    const script = String(district?.script ?? "");
    const pack = sayIn(language);

    const lines: [string, string][] = [
      ["opening", pack.openStall.native],
      ["counter opening", pack.openCounter.native],
      ["greeting back", pack.greetBack.native],
      ["price line", pack.price(40)],
      ...REFUSAL_REASONS.map((r) => [`refusal:${r}`, pack.refusals[r]] as [string, string]),
    ];

    const wrong = lines.filter(([, text]) => !looksLikeTargetScript(text, script));
    check(`${language} (${script}) says all ${lines.length} of its own lines in its own script`,
      wrong.length === 0,
      wrong.map(([what, text]) => `${what}="${text}"`).join(" · "));

    check(`  ${language} names the price it was given`, pack.price(40).includes("40"));
    check(`  ${language} is not quietly the Hindi pack`,
      language === "hi-IN" || pack.openStall.native !== sayIn("hi-IN").openStall.native,
      pack.openStall.native);
  }

  // EVERY OTHER PER-LANGUAGE SURFACE, WALKED THE SAME WAY.
  //
  // The engine's own lines were the third table found short, not the first, so
  // this checks the rest of them together rather than one screenshot at a time:
  // what the goods are called, what the cast is called, and what the phrase
  // bank offers. A language passes here or it is not finished.
  for (const language of COMPILABLE_LANGUAGES) {
    const script = String(SEED_DISTRICTS.find((d) => d.language === language)?.script ?? "");

    const badGoods = GOODS.filter((g) => !looksLikeTargetScript(g.native[language], script));
    check(`  ${language}: all ${GOODS.length} goods have a name in it`,
      badGoods.length === 0,
      badGoods.map((g) => `${g.id}="${g.native[language]}"`).join(" · "));

    // Every info key answerable, in this language. An `ask` errand is half the
    // mission templates and it was unwinnable in every compiled world.
    const badAnswers = INFO_KEYS.filter(
      (k) => !looksLikeTargetScript(sayIn(language).answers[k]("7"), script)
    );
    check(`  ${language}: can answer all ${INFO_KEYS.length} things it can be asked`,
      badAnswers.length === 0, badAnswers.join(", "));
    check(`  ${language}: an answer carries the fact it was given`,
      sayIn(language).answers.platform_number("4").includes("4"));

    const bank = bankFor(language);
    check(`  ${language}: the phrase bank is its own, not a fallback`,
      bank.length > 0 && bank.every((b) => looksLikeTargetScript(b.native, script)),
      `${bank.length} phrases`);

    // Every errand template has to find phrases, or a mission compiles with an
    // empty `keyPhrases` and the coach has nothing to fall back on.
    for (const scope of ["buy", "ask"] as const) {
      check(`  ${language}: the ${scope} errand has phrases`,
        phrasesForErrand(language, scope).length > 0);
    }
  }

  // And the compiler uses it, which is where the bug actually surfaced.
  check("the opening a compiled world hands a stallholder is its own language",
    looksLikeTargetScript(sayIn("pa-IN").openStall.native, "Gurmukhi"),
    sayIn("pa-IN").openStall.native);
  check("and the one it hands a ticket clerk is too",
    looksLikeTargetScript(sayIn("od-IN").openCounter.native, "Odia"),
    sayIn("od-IN").openCounter.native);
  check("a Punjabi world calls tomatoes what Punjabi calls them",
    goodById("tomato")!.native["pa-IN"] === "ਟਮਾਟਰ", goodById("tomato")!.native["pa-IN"]);

  // NO OTHER LANGUAGE'S SCRIPT MAY APPEAR IN A PROMPT.
  //
  // The narrowest and most useful check in this file. The instruction telling
  // the model what a whole sentence looks like carried a worked example — and
  // the example was written in Telugu, so a Punjabi shopkeeper was being shown
  // Telugu as the model of good Punjabi. Several languages answered with
  // two-word cards while Hindi wrote whole sentences, and that was why.
  //
  // Rendering the real prompt and scanning it is the only way to catch this
  // class of thing, because it always arrives as one helpful example somebody
  // pasted in while debugging a single language.
  const ALL_SCRIPTS = [
    "Devanagari", "Tamil", "Kannada", "Bengali", "Telugu",
    "Malayalam", "Gujarati", "Gurmukhi", "Odia",
  ];
  for (const language of COMPILABLE_LANGUAGES) {
    const script = String(SEED_DISTRICTS.find((d) => d.language === language)?.script ?? "");
    const phrases = bankFor(language);
    // A whole world in that language, not a Telugu one with its phrases
    // swapped: the brief renders the cast's names and openings, and a fixture
    // that left those in Telugu would fail for its own reasons rather than the
    // one this check is looking for.
    const pool = NAME_POOL[language]!;
    const world = {
      ...S,
      language,
      script,
      languageLabel: language,
      phrases,
      characters: S.characters.map((c, i) => ({
        ...c,
        name: pool[i % pool.length].native,
        opening: { ...sayIn(language).openStall },
      })),
      // The bazaar's answers are authored Telugu, which a Punjabi fixture would
      // fail on for its own reasons. A compiled world gets these from `say.ts`
      // in its own language — that path is checked by the `answers` sweep
      // below. What THIS check is for is the prompt template: a worked example
      // somebody pasted in while debugging one language.
      facts: S.facts.map((f) => ({ ...f, answer: undefined, answerTokens: undefined })),
    } as unknown as typeof S;

    const rendered = turnSystemPrompt(world, world.characters[0], {
      stock: [`${goodById("tomato")!.native[language]} — 4 left`],
      understands: "English",
      wants: ["find out what they want"],
    });

    const strangers = ALL_SCRIPTS.filter(
      (x) => x !== script && looksLikeTargetScript(rendered, x)
    );
    check(`  ${language}: its prompt is written in ${script} and nothing else`,
      strangers.length === 0, strangers.join(", "));
  }
}

console.log("\n32. a question she asks you is a thing you can answer");
{
  // She asked "are you from another city, or are you local here?" and the card
  // underneath read "Auntie, I need some tomatoes, how much are they?". Every
  // move the coach was allowed to make was a move about the shopping, so being
  // asked something personal had nowhere to go.
  check("answering is a language function now",
    (LANGUAGE_FUNCTIONS as readonly string[]).includes("answer"));

  const w = openingState(S, "ans");
  const m1 = missionFor(S, w, "lakshmi")!;
  // It must never be vetoed. Answering what you were just asked is not a thing
  // the world can make pointless.
  for (const state of [w, applyMutations(S, w, [
    { kind: "fact", key: "rung.L1.tomato", value: 0 },
  ]).state]) {
    const c = coachFor(S, state, m1, { verb: "greet", ok: true });
    check("  the card still has something to say either way", !!c.say);
  }

  // And the vetter lets it through whatever the errand happens to want.
  const inScript = (t: string) => /[ఀ-౿]/.test(t);
  const vetted = vetCoachLine(
    { native: "నేను ఢిల్లీ నుంచి వచ్చాను అండి", roman: "nenu dhilli nunchi vachchaanu andi",
      meaning: "I have come from Delhi", move: "answer" },
    { script: "Telugu", saidByThem: "మీరు ఎక్కడి నుంచి?", saidByYou: "నమస్కారం",
      stale: false, example: "కిలో ఎంత?", wants: ["ask_price", "greet", "answer"],
      inScript: (t) => inScript(t) }
  );
  check("a sentence that answers her passes the move check", !!vetted, vetted?.native ?? "-");
  check("and one that claims a move nobody asked for still does not",
    !vetCoachLine(
      { native: "నేను ఢిల్లీ నుంచి వచ్చాను అండి", meaning: "from Delhi", move: "negotiate" },
      { script: "Telugu", saidByThem: "x", saidByYou: "y", stale: false,
        example: "కిలో ఎంత?", wants: ["ask_price", "greet", "answer"],
        inScript: (t) => inScript(t) }
    ));
}

console.log("\n33. the whole card answers the same turn");
{
  // Mid-haggle, ₹45 on the table, the headline saying close it — and the line
  // underneath offered "hello". Three surfaces on one card, each computed its
  // own way, disagreeing in front of the player.
  const priced = applyMutations(S, openingState(S, "card"), [
    { kind: "fact", key: "rung.L1.tomato", value: 1 },
  ]).state;
  const m1 = missionFor(S, priced, "lakshmi")!;
  const c = coachFor(S, priced, m1, { verb: "concede", ok: true });

  check("the headline is about closing the deal",
    c.wants.includes(c.say!.drills), `${c.say?.id} / ${c.wants.join(",")}`);
  check("and so is everything offered beside it",
    c.also.every((p) => c.wants.includes(p.drills)),
    c.also.map((p) => `${p.id}:${p.drills}`).join(" · "));
  check("nobody is told to say hello in the middle of a haggle",
    !c.also.some((p) => p.drills === "greet"),
    c.also.map((p) => p.id).join(" · "));
  check("an alternative never repeats the headline's move",
    !c.also.some((p) => p.drills === c.say?.drills));

  // Opening a conversation, where greeting IS the move, it is still offered.
  const fresh = coachFor(S, openingState(S, "card2"), m1, null);
  check("but at the start of one, hello is exactly right", fresh.say?.drills === "greet");
}

console.log("\n34. one reading of where the conversation is");
{
  // Four bugs in four costumes, all the same bug: the prompt, the coach, the
  // panel and the ending each worked out where the exchange was, separately.
  // `lib/sim/exchange.ts` is the one answer they all read now.
  let w = openingState(S, "phase");
  check("walking up to a stall is a greeting",
    phaseFromWorld(S, w, "lakshmi") === ExchangePhase.GREETING);

  w = applyMutations(S, w, [{ kind: "fact", key: "greeted.lakshmi", value: true }]).state;
  check("once you have said hello, you are asking",
    phaseFromWorld(S, w, "lakshmi") === ExchangePhase.ASKING);

  w = applyMutations(S, w, [{ kind: "fact", key: "rung.L1.tomato", value: 0 }]).state;
  check("a price on the table is bargaining",
    phaseFromWorld(S, w, "lakshmi") === ExchangePhase.BARGAINING);

  const nothingOwed = { ...w, missions: Object.fromEntries(S.missions.map((m) => [m.id, "complete" as const])) };
  check("nothing owed is settled",
    phaseFromWorld(S, nothingOwed, "lakshmi") === ExchangePhase.SETTLED);

  check("and the world never says a conversation is over",
    ![w, nothingOwed, openingState(S, "p2")].some(
      (st) => phaseFromWorld(S, st, "lakshmi") === ExchangePhase.DONE));

  // THE BARGAIN: she proposes, the table decides.
  check("she can end it when nothing is owed",
    advance(S, nothingOwed, "lakshmi", ExchangePhase.DONE).phase === ExchangePhase.DONE);
  check("but not in the middle of a haggle",
    advance(S, w, "lakshmi", ExchangePhase.DONE).phase === ExchangePhase.BARGAINING);
  check("and the engine says it refused rather than silently ignoring her",
    advance(S, w, "lakshmi", ExchangePhase.DONE).rejected);
  check("proposing nothing leaves the world's answer alone",
    advance(S, w, "lakshmi", null).phase === ExchangePhase.BARGAINING);

  // The table itself.
  check("nothing comes back out of DONE", PHASE_EDGES.DONE.length === 0);
  check("a sale cannot be un-sold",
    !isPhaseMoveAllowed(ExchangePhase.SETTLED, ExchangePhase.GREETING));
  check("but a second errand at the same stall can start",
    isPhaseMoveAllowed(ExchangePhase.SETTLED, ExchangePhase.ASKING));
  check("and you may buy without small talk first",
    isPhaseMoveAllowed(ExchangePhase.GREETING, ExchangePhase.BARGAINING));

  // Only one thing renders the rules now.
  check("every phase has something to tell her",
    Object.values(ExchangePhase).every((ph) => phaseBlock(ph, false).length > 40));
  check("and the bargaining one changes when they have agreed",
    phaseBlock(ExchangePhase.BARGAINING, true) !== phaseBlock(ExchangePhase.BARGAINING, false));
  check("only the settled one invites her to end it",
    Object.values(ExchangePhase).filter((ph) => phaseBlock(ph, false).includes('intent')).length === 1);
}

console.log("\n35. the one who listens is not the one who talks");
{
  // Ported from gideon: `IntakeAgent` speaks, and a separate temperature-0 call
  // with a strict schema reports what the caller said. SADAK had been bolting
  // another key onto the reply every time something needed knowing — eleven of
  // them — and then acting surprised when one call chose `accept` and reported
  // hearing a greeting on the same turn.
  const ok = turnReadSchema.safeParse({ heard: "ask", intent: "open" });
  check("a well-formed read parses", ok.success);
  check("a heard nobody defined does not",
    !turnReadSchema.safeParse({ heard: "mumbled", intent: "open" }).success);
  check("nor an intent nobody defined",
    !turnReadSchema.safeParse({ heard: "ask", intent: "hungry" }).success);
  check("nor a read missing half of itself",
    !turnReadSchema.safeParse({ heard: "ask" }).success);
  check("every reading the engine knows about is one the reader can return",
    HEARD.every((h) => turnReadSchema.safeParse({ heard: h, intent: "open" }).success));

  // The speaker's contract lost the two fields the reader now owns.
  const spoken = turnSystemPrompt(S, S.characters[0], { stock: [], understands: "English" });
  check("the speaking prompt no longer asks what was heard", !spoken.includes("- heard:"));
  check("nor where the conversation stands", !spoken.includes("- intent:"));
  check("and it says who is doing that instead",
    spoken.includes("YOU ONLY DO YOUR OWN HALF"));
  // The third split: she no longer writes the customer's sentence either. It
  // was a THIRD of her prompt, and she started speaking as them — "I needed
  // tomatoes but today they are all finished", from the woman selling them.
  check("nor does she write the customer's line any more",
    !spoken.includes("WHAT THE CUSTOMER COULD SAY BACK"));
  check("and the contract is five keys of her own",
    spoken.includes('{"act":"quote","target":"tomato","reply_native":"...","reply_roman":"...","reply_meaning":"..."}'));
}

console.log("\n36. the card, the reason and the alternatives say the same thing");
{
  const w = openingState(S, "same");
  const m1 = missionFor(S, w, "lakshmi")!;

  // YOU ONLY SAY HELLO ONCE. Four turns in, with her explaining the tomatoes
  // had run out, the alternatives still offered "Hello" — greeting passed every
  // filter there was, because nothing in the world a greeting needs is ever
  // missing. Except the one thing: having already done it.
  check("before you have greeted her, hello is on the list",
    coachFor(S, w, m1, null, "lakshmi").say?.drills === "greet");

  const greeted = applyMutations(S, w, [
    { kind: "fact", key: "greeted.lakshmi", value: true },
  ]).state;
  const after = coachFor(S, greeted, m1, { verb: "greet", ok: true }, "lakshmi");
  check("afterwards it is gone from the headline", after.say?.drills !== "greet",
    after.say?.id ?? "-");
  check("and gone from the alternatives",
    !after.also.some((p) => p.drills === "greet"),
    after.also.map((p) => p.id).join(" · "));
  check("and gone from the moves the suggestion may claim",
    !goalFor(S, greeted, m1, "lakshmi").wants.includes("greet"));

  // THE REASON DESCRIBES THE CARD. It used to describe her ACT, and the two
  // came apart the moment the suggestion started answering what she said: the
  // card asked when she would have tomatoes again, and the line beneath it read
  // "She has said hello. Tell her what you came for."
  check("a move the engine knows has a reason of its own",
    becauseForMove("ask_location") === "Ask where else you can get it.");
  check("answering her is named as answering her",
    (becauseForMove("answer") ?? "").includes("Answer her"));
  check("every move a suggestion may claim can be explained",
    LANGUAGE_FUNCTIONS.every((fn) => !!becauseForMove(fn)));
  check("and a move nobody defined explains nothing",
    becauseForMove("loitering") === null);
}

console.log("\n37. the run you just played changes the next one");
{
  // `chooseObstacles` was written to read the learner's ledger and drill their
  // coldest functions — "the difference between practice and repetition", its
  // own words. Every call site passed `{}`. The ledger was filled in for twenty
  // minutes and thrown away at the debrief, so every run anybody ever played
  // began from "this person has never spoken the language".
  const fresh = { v: 1, languages: {} };
  check("a new learner knows nothing", Object.keys(historyFor(fresh, "te-IN")).length === 0);

  const run1 = {
    ...openingState(S, "l1"),
    functions: { greet: 3, ask_price: 2 },
    history: [
      { n: 1, clock: 1120, characterId: "lakshmi", input: "voice" as const,
        said: "నమస్కారం", tokens: 1, sttOk: true, silent: false, assent: null,
        distinctContent: true, act: "greet", rejected: null, nullTurn: false, points: 85 },
      { n: 2, clock: 1121, characterId: "lakshmi", input: "voice" as const,
        said: "కిలో ఎంత?", tokens: 2, sttOk: true, silent: false, assent: null,
        distinctContent: true, act: "quote", rejected: null, nullTurn: false, points: 100 },
    ],
  };

  const after1 = recordRun(fresh, "te-IN", run1);
  check("one run later it knows what they did",
    historyFor(after1, "te-IN").greet === 3 && historyFor(after1, "te-IN").ask_price === 2);
  check("and how many runs and turns that was",
    recordFor(after1, "te-IN").runs === 1 && recordFor(after1, "te-IN").turns === 2);
  check("and keeps their best line",
    recordFor(after1, "te-IN").best?.points === 100);

  // Counts SUM across runs. A learner who greets three times a run for a month
  // has greeted a lot, and the fade has to know it.
  const after2 = recordRun(after1, "te-IN", run1);
  check("a second run adds to the first", historyFor(after2, "te-IN").greet === 6);
  check("and a worse best line does not replace a better one",
    recordFor(after2, "te-IN").best?.points === 100);

  // Languages are kept apart. Telugu practice is not Punjabi practice.
  const pa = recordRun(after2, "pa-IN", run1);
  check("another language starts from zero", historyFor(pa, "pa-IN").greet === 3);
  check("and does not disturb the first", historyFor(pa, "te-IN").greet === 6);

  // THE POINT OF ALL OF IT.
  const cold = chooseObstacles(S, {}, 0).map((c) => c.obstacle.id).join();
  const warm = chooseObstacles(S, historyFor(after2, "te-IN"), 0).map((c) => c.obstacle.id).join();
  check("a learner with a history gets a different run from a beginner",
    cold !== warm, `${cold} vs ${warm}`);

  // What the debrief is allowed to claim.
  const p1 = progressAfter(fresh, "te-IN", run1);
  check("the first run reports what was new in it",
    p1.newThisRun.includes("greet") && p1.newThisRun.includes("ask_price"));
  const p2 = progressAfter(after1, "te-IN", run1);
  check("the second reports nothing new, because nothing was",
    p2.newThisRun.length === 0, p2.newThisRun.join(","));
  check("and both know what has never been done",
    p2.cold.includes("compare") && !p2.cold.includes("greet"));
}

console.log(failures === 0 ? "\nAll good.\n" : `\n${failures} failure(s).\n`);
process.exit(failures === 0 ? 0 : 1);
