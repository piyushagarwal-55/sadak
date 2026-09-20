# Architecture: tasks, stakes and scoring

Date: 2026-09-18. Audience: the developer building it, and the project owner for section 9. Status: decided, except section 9.

Sibling to `../docs/RESEARCH-world-generation.md`, which this obeys. Where that document left something open, this one closes it and says so. Where a designer proposed something that a reading of the code showed could not work, this one takes the version that works and records what was killed. Every file:line citation here was re-read on 2026-09-18 against the working tree; three claims in the inputs to this document were wrong about the code and are corrected where they appear.

---

## 1. What this decides

A task is a **typed template**, not a sentence. The model picks what the errand is from a closed catalogue — which good, from which trade, for how much. Code turns that into a `MissionNode` whose completion is an equality test on facts that the action layer wrote while doing arithmetic the model never saw. There are two templates, `buy` and `ask`, and `buy` carries a flag for whether beating the opening price is required. That is the whole taxonomy, and it is deliberately smaller than any of the four designs proposed.

**The single most important decision in this document is the player-assent gate.** Before the action layer writes any fact that advances a mission, the player's last utterance must score at least 0.40 against one of that mission's authored key phrases, using `scoreAttempt` (`lib/game/speech-score.ts:67`) — the order-preserving weighted LCS that already ships. No model, no judge, pure arithmetic, about fifteen lines. It exists because four of the seven families in the taxonomy proposal, and every mission in the context proposal, could be completed with the player silent or speaking English: `point_to`'s only precondition was "that stall exists", `tell_fact`'s was "the key is in a list I was handed", and nothing anywhere consumed the player's assent to a price. The assent gate closes all of them at once, makes `keyPhrases` load-bearing instead of decorative, and — this is the part worth saying to a judge — means **a run cannot be completed in English**, because an English sentence does not align with a Telugu phrase. It is also robust to the one STT failure everybody feared: if Saaras transliterates English into Telugu script, a script-ratio check inverts silently, but "how much is this" rendered in Telugu letters still does not align with `కిలో ఎంత?`.

**The model never names a number.** Prices walk down a three-rung ladder the engine computes at compile time: `[opening, mid, floor]`. The model chooses `quote`, `concede`, `accept` or `refuse`; code supplies the rupees. This replaces `quote_price{item, price}` from the research doc's §4.5, whose only guard was `floor <= price <= opening` — a thirty-rupee window on the demo's own tomatoes, inside which the model could collapse the haggle to one turn by quoting the floor, or strand a player by never reaching it. It also removes every integer from the per-turn JSON, leaving four flat string fields, which is the shape `lib/game/prompt.ts:23` has already proven stable on this model.

**Stakes are the clock and the wallet. Patience is a cooldown, not a failure.** A mission fails from one cause only: the deadline. Patience running out writes `away.<cast> = true`, removes the interactable, and gives the vendor back ninety in-world seconds later at patience 1 with a ten percent higher opening. This is not softness; it is that `MissionState` has no path back from `failed` (`schema.ts:135`, `state.ts:155-165` promotes only `locked -> active`), so a patience failure on the first mission leaves every downstream mission `locked` forever, `isComplete` (`state.ts:236-240`) never returns true, and the run has no ending at all.

**Scoring is 85 points of arithmetic and 15 points of clamped opinion.** Mission outcome is half the score and the model cannot touch it. The judge returns labels from closed enums, never numbers, and its contribution is clamped to within ±0.34 of the objective language score, so a model that calls a silent run "clear" is overruled by division. It runs once, after the run ends, off the critical path.

**Missions complete from facts. `criterion` is demoted to a debrief-only field.** That is research rule 4 made structural, and it is the answer to the open question the research doc left at §7 ("Mission completion authority"): yes, take the trade. `lib/sim/scenarios/jaipur-date.ts` is declared legacy and is not ported.

The first step that makes the loop playable end to end is **step 5**, `app/api/sim/turn` against a hand-authored scenario. The compiler is step 8. A demo that plays one authored Hyderabad errand flawlessly beats one that compiles a fresh errand and then hangs on a grey card.

---

## 2. The task model

### 2.1 Two templates, one flag

A family is only real if a closed action can prove it happened. That test, applied honestly, leaves two:

| template | the player must | proved by | completes on |
|---|---|---|---|
| `buy` | name the good, hear a price, agree to one, pay | `accept` behind the assent gate | `bought.<slot>.<item> === true` |
| `ask` | get a fact out of a head they cannot see into | `tell` or `point` behind the assent gate | `info.<key> === true` |

`buy` carries `haggle: boolean`. When true, completion additionally requires `beat.<slot>.<item> === true`, written when the accepted rung is below the opening. That is the difference between the beginner and intermediate bands, and it is a flag rather than a third template because the mechanics are identical — only the completion clause differs.

Everything else the taxonomy lens proposed — REDRESS, DECLINE, SPECIFY, ROUTE as a separate family — is defined in section 8 and not built. `gift`/`deliver` from the context lens is cut outright: no action in the vocabulary hands an item over, so every advanced-band spec would have contained a mission that could neither complete nor fail.

### 2.2 The difficulty ladder

Speed is not the difficulty axis and `clock.rate` stays at 3 across all bands. This is the strongest single piece of reasoning in the four proposals and it survives intact: time pressure is resource-dispersing — it makes an intermediate learner perform like a beginner while teaching them nothing — and on a turn loop already bound by STT plus a 27B model plus TTS, a difficulty dial that squeezes latency would make the top band unplayable on stage. The clock is stakes and drama. It is not difficulty.

What moves is information availability, how much the vendor concedes unasked, and how much scaffolding the panel shows.

```
                      beginner        intermediate      advanced
missions per run          2                3                4
haggle required          no               yes              yes
floorRatio              0.90             0.80             0.65
walletBand              0.95             0.80             0.68
priceReveal          volunteered     volunteered      on_ask_only
assentThreshold         0.40             0.40             0.55
patience                  5                3                3
patienceGraceTurns        4                3                2
scaffold.phrases          3                3                3
scaffold.showRoman      always          always        hold_to_reveal
scaffold.showGloss      always         on_hover           never
deadlineMinutes          none              22               26
clockRate                 3                3                3
```

Two numbers need defending. `floorRatio: 0.90` at beginner rather than 1.00: a degenerate interval where floor equals opening collapses the ladder to a single legal rung, which is the narrowest possible target for the model in the band whose entire purpose is that a first-timer does not bounce. Nine-tenths leaves the ladder three real rungs while `haggle: false` keeps bargaining unnecessary. And `patience: 5` at beginner against the research doc's 3: a first-time player who loses a vendor in their first ninety seconds does not come back. Three stays the default everywhere else, as §4.5 specifies.

`walletBand` multiplies the summed opening prices. At intermediate, paying every opening price leaves you twenty percent short, so at least one haggle must land. Two compile-time invariants, checked and re-rolled on failure:

```
wallet  = round10( Σ(opening_i × qty_i) × walletBand )
G-WIN   wallet ≥ Σ(floor_i × qty_i) × 1.15     the run is winnable with margin
G-PUSH  wallet < Σ(opening_i × qty_i)          bargaining is mandatory  [intermediate+]
```

### 2.3 A real MissionNode

Hyderabad, Telugu, intermediate. `bangle_stall` bound to logical slot `R1`, keeper Noor. Opening ₹220, floor = `round5(220 × 0.80)` = ₹175 — but the demo scenario in section 6 pins floor at ₹140 by hand, because an authored demo is allowed to be tuned and a generated one is not.

```ts
{
  id: "m3-bangles",
  title: "గాజులు — a gift for Amma",
  brief: "Noor opens at two hundred and twenty. Get the bangles for less.",
  template: { kind: "buy", slot: "R1", item: "bangles", qty: 1, haggle: true },
  characterId: "noor",

  preconditions: [
    { kind: "fact", key: "info.bangle_stall", equals: true },
  ],

  // Fact-derived, equality only. The action layer collapsed every threshold
  // into a boolean at the moment it did the arithmetic.
  completeWhen: [
    { kind: "fact", key: "bought.R1.bangles", equals: true },
    { kind: "fact", key: "beat.R1.bangles",   equals: true },
  ],

  // The deadline, and nothing else. Patience writes away.noor, not a failure.
  failWhen: [
    { kind: "clock", afterMinutes: 1140 },   // 7:00pm
  ],

  effects: [],        // rewards are paid by settle(), not by an effect — see 2.4
  failEffects: [],
  reward: 40,

  keyPhrases: ["p_bangle_price", "p_reduce", "p_too_much", "p_agree"],
  parTurns: 6,
  hintAfterTurns: 4,

  // DEBRIEF ONLY. Never read in the live loop. This is rule 4 made structural.
  debriefCriterion:
    "Asked the price before naming a number, countered at least once, and closed below two hundred and twenty without giving offence.",
}
```

The mission turns green because `bought.R1.bangles` and `beat.R1.bangles` are both `true` in `state.facts`. No grader ran. That sentence is the demo.

### 2.4 Why `reward` cannot be an effect, and what settle() actually does

The taxonomy lens wrote `effects: [{ kind: "fact", key: "wallet", value: 250 }]` with the comment "reward pre-computed". That silently never pays. `Mutation` sets an absolute value (`schema.ts:131-133`), the wallet at completion time is only knowable at completion time, and if the pre-computed value happens to equal the current one, `vet()` returns `"no change"` (`state.ts:78`) — the one rejection deliberately filtered out of the `rejected` array (`state.ts:136-138`, "an extractor restating the world it was just shown is normal"). The forty rupees evaporate with no error, no log entry and no rejection. This is structural, not a typo: **no `MissionNode.effects` can ever express a reward under absolute-only `Mutation`.**

So `settle()` does arithmetic. It is not a pure condition evaluator, and its contract says so:

```ts
/**
 * Runs after every applyMutations batch and after every clock advance.
 * For each mission currently `active`:
 *   failWhen holds  -> propose {mission, failed}, then failEffects
 *   completeWhen holds -> propose {mission, complete}, then
 *                         {fact, "wallet", state.facts.wallet + mission.reward}
 * Evaluated over ACTIVE missions only. A `locked` mission the player was never
 * allowed to start must not fail on a deadline it never saw.
 * Proposals go back through applyMutations, so vet() still has the last word.
 */
export function settle(scenario: Scenario, state: WorldState): ApplyResult;
```

Scoping the failure sweep to `active` matters: `{kind: "clock", afterMinutes: 1140}` is absolute-from-scenario-start and identical across missions, so an unscoped sweep fails every unfinished mission at 7:00pm including ones still locked behind a purchase the player was never allowed to make. And `vet()` guards `complete` against an unreachable mission (`state.ts:89-91`) but does not guard `failed` at all — `settle()` calling it only for active missions is what supplies that guard.

---

## 3. The closed catalogue

This is the contract that keeps the model out of reality. Every identifier below is rendered into the prompt in the same call that may return it, so validation is set membership, not semantic judgement.

### 3.1 Goods — authored, not derived from tags

The three lenses that needed a goods list all took the union of `STALLS[kind].tags` (`lib/sim/kit/stalls.js:613-625`). Re-reading that registry, tags are search descriptors, not objects. `ground_sheet` carries `['floor', 'sabzi', 'cheap']`, so `{kind: "buy", item: "floor", max_price: 35}` — buy a floor for thirty-five rupees — passes a tag-membership check cleanly, as does "buy cheap". `plastic_stall` and `pot_stall` both carry `household`; `coconut_stall` carries `tender`. And `bangle_stall` carries `gift` (`stalls.js:618`), which collided with `gift` as a mission kind in the context proposal's own prompt.

So `lib/sim/compile/goods.ts` is authored. Ten entries, each naming the one stall kind that sells it, the unit the vendor quotes in, and an English gloss for the mission card. Tags stay what they are.

| id | stall kind | unit | gloss | te-IN |
|---|---|---|---|---|
| `tomato` | `veg_stall` | kilo | tomatoes | టమాటా |
| `mango` | `fruit_stall` | dozen | mangoes | మామిడి |
| `masala` | `spice_stall` | packet | spice mix | మసాలా |
| `saree` | `cloth_stall` | piece | a saree | చీర |
| `bangles` | `bangle_stall` | set | bangles | గాజులు |
| `chai` | `chai_tapri` | glass | tea | చాయ్ |
| `bucket` | `plastic_stall` | piece | a bucket | బకెట్ |
| `garland` | `flower_stall` | moora | a flower garland | పూలదండ |
| `tumbler` | `pot_stall` | set | steel tumblers | గ్లాసులు |
| `coconut` | `coconut_stall` | piece | a tender coconut | కొబ్బరి |

`fish_stall` and `ground_sheet` are built as scenery and carry no mission good. A fishmonger persona is the one most likely to go somewhere nobody wants it to go in front of judges, and the ground sheet exists as the recovery route in section 6.

### 3.2 Information keys

The only `ask` targets. Eight, authored, each with a **checkable answer token** — see 3.4 for why that exists.

```
bangle_stall_location   chai_stall_location   gate_direction      market_closing_time
where_from              best_price_today      festival_today      rain_shelter
```

### 3.3 Fact keys

The complete namespace an expanded scenario may contain. The expander writes every one of these; the model writes none of them, ever.

| key | type | visibility | mutable | written by |
|---|---|---|---|---|
| `wallet` | number | `player` | yes | `accept` |
| `bag.<item>` | number | `all` | yes | `accept` |
| `stock.<slot>.<item>` | number | `[vendor]` | yes | `accept` |
| `price.<slot>.<item>` | number | `[vendor]` | **no** | — opening, locked |
| `floor.<slot>.<item>` | number | `[vendor]` | **no** | — the physics |
| `rung.<slot>.<item>` | number | `[vendor]` | yes | `quote`, `concede` — 0, 1 or 2 |
| `deal.<slot>.<item>.price` | number | `all` | yes | `accept` |
| `bought.<slot>.<item>` | boolean | `player` | yes | `accept` — milestone |
| `beat.<slot>.<item>` | boolean | `player` | yes | `accept` — milestone |
| `info.<key>` | boolean | `all` | yes | `tell`, `point` |
| `greeted.<cast>` | boolean | `player` | yes | assent to a greet phrase |
| `patience.<cast>` | number | `[vendor]` | yes | engine, clamped at 0 |
| `away.<cast>` | boolean | `all` | yes | engine at patience 0 |
| `clarify.<cast>` | number | `[vendor]` | yes | `clarify` |
| `market.closing` | boolean | `all` | yes | engine on the clock |
| `weather.rain` | boolean | `all` | yes | engine on the clock |

Two rules about that table are load-bearing and were got wrong in the inputs. **Every milestone and meta fact is `visibility: "player"`**, which `schema.ts:51-53` already defines as "shown in the HUD but never handed to an NPC" and which nothing in the repo currently uses. The context proposal marked `bought.*` and a `deal_ok.*` carrying the label "the tomatoes were bought at thirty-five or less" as `visibility: "all"`, which pipes the mission's own win threshold into every vendor's prompt. And `patience.<cast>` is visible to its own vendor as a *disposition clause*, never as a number — telling a model its patience counter reads 1 invites it to perform running out.

`floor.<slot>.<item>` is locked and visible to exactly one character. That single line is the whole of "the model never controls reality" for the economy, the same way `restaurant.mushroom_pasta` is at `jaipur-date.ts:221`. Enforcement is doubled: the action layer refuses an accept below the floor rung before `applyMutations` is reached, `vet()` refuses any write to a locked fact (`state.ts:77`), and `validateScenario` refuses a scenario that even declares one as an effect (`schema.ts:298-301`).

### 3.4 The action vocabulary

Nine verbs, no numeric operands, at most one target drawn from a list rendered in the same prompt.

| verb | target | preconditions | writes | class |
|---|---|---|---|---|
| `greet` | — | — | — | soft |
| `clarify` | — | — | `clarify.<cast>` += 1 | soft |
| `quote` | item | item is this vendor's good | `rung` = 0 | soft |
| `concede` | item | `rung < 2` | `rung` += 1 | soft |
| `accept` | item | **assent** ∧ `rung` named ∧ `stock ≥ qty` ∧ `wallet ≥ ladder[rung] × qty` | wallet, bag, stock, deal, `bought`, `beat` | **hard** |
| `refuse` | item | item is this vendor's good | — | soft |
| `point` | slot | **assent** ∧ slot is built ∧ slot ≠ mine ∧ **the reply names the target's board** | `info.<key>` | **hard** |
| `tell` | info key | **assent** ∧ key ∈ `character.knows` ∧ **the reply carries the answer token** | `info.<key>` | **hard** |
| `end` | — | — | closes the panel | soft |

**soft** actions that fail are dropped and the reply is kept; nothing material moved. **hard** actions that fail discard the model's reply entirely and speak a hand-written templated refusal — research §4.6's rule, and the reason it exists is that the alternative is a voice saying "here are your tomatoes" over a bag that stayed empty.

Two preconditions in that table need naming because they are the fixes to the two ways an honest-looking design leaks authority back to the model.

**Assent.** For `accept`, `point` and `tell`, the player's last utterance to this character must satisfy `scoreAttempt(phrase.native, transcript).accuracy >= band.assentThreshold` for at least one `keyPhrase` of the mission being advanced, and the phrase must be of the right class — an accept-class phrase for `accept`, an ask-class phrase for `tell` and `point`. A reciter firing `కిలో ఎంత?` eleven times assents to the price question forever and never to the close.

**The answer token.** `tell` and `point` were the two places the engine believed the model's word that information had been conveyed. `point{R1}` writes `info.bangle_stall_location` only if `reply_native` contains the bound board name for R1 — which code holds, because code hung that board (`signage.js:144`, `shopNamesFor` at `:214`) or took it from the VoicePack. `tell{market_closing_time}` writes its fact only if the reply contains the clock digits. A plain substring test, sub-millisecond, and it is deterministic evidence that the thing was actually said. An info key with no checkable token does not go in the list.

### 3.5 The price ladder

Three rungs, computed at compile time, stored as locked facts:

```
ladder[0] = opening
ladder[1] = round5( (opening + floor) / 2 )
ladder[2] = floor
```

Tomatoes at opening ₹40, floor ₹32 give `[40, 35, 32]` — which is exactly the 40 → refuse → 35 beat the research doc scripts at §6, 1:30–2:15, now produced by arithmetic rather than by hoping. Bangles at ₹220 and ₹140 give `[220, 180, 140]`.

`rung.<slot>.<item>` starts unset. `quote` sets it to 0. `concede` steps it up, capped at 2. `accept` charges `ladder[rung] × qty` — read from the fact, never from anything the model said. The haggle therefore cannot collapse below three turns and cannot fail to terminate, and there is no integer anywhere in the model's output to validate.

### 3.6 World nouns and languages

Stall kinds are the twelve in `STALLS` (`stalls.js:613-625`). A mission-bearing kind is **force-built**: `buildStalls` (`bazaar.js:757-790`) takes a `required` array whose kinds bypass the `this.rand() > keep` roll at `:764`. That is about five lines and it supersedes the whole `planQuarter` extraction proposed by the context lens — see section 8.

Logical slot ids (`L1`, `R4`) are assigned **after** the world is built, by a binder that walks `this.stalls` (each entry `{id, slot, group}` at `bazaar.js:786`, where `id` is the kind) and binds the mission's good to the nearest built stall of the right kind, first mission nearest to spawn. The model never sees a slot id. It names a *good*.

Languages: `te-IN`, `hi-IN`, `ta-IN`, and no others. `SHOP_NAMES` covers exactly three (`signage.js:171-211`), `AMBIENT_LINES` covers exactly three (`market-life.js:90-103`), `BUBBLE_FONT` covers exactly three (`market-life.js:105-109`). `LangCode` allows eleven (`lib/sarvam.ts:30-32`); the other eight would render a Kannada errand on Devanagari boards via the fallback at `signage.js:214`. The gate sits on the city picker, not at render time.

Speakers are assigned by code from `V3_SPEAKERS` (`sarvam.ts:41-47`), one per cast member, never repeated within a scenario. `schema.ts:100` claims this is "validated against `V3_SPEAKERS` at load" and `validateScenario` (`schema.ts:241-314`) does no such check; the expander assigning them removes the need for one, and the check is added anyway.

---

## 4. The Groq contract

Model is `qwen/qwen3.8-27b` and that is fixed (`lib/sim/groq.ts:37`). `response_format: json_object`, never `json_schema` — `lib/game/prompt.ts:18-22` records that under `json_schema` this model satisfies the required keys and then pads whitespace until `max_tokens`, leaving the object unterminated. That was measured on this account and is not relitigated here.

### 4.1 Compile — system message, verbatim

```
You are the ERRAND COMPILER for SADAK, a language-learning simulator.

A player typed one sentence about what they want to practise. You turn it into
an errand in a market in {{CITY}} that has ALREADY BEEN BUILT. You are writing
a script for a stage that already has its set.

WHAT YOU CHOOSE
Who the player deals with, what they have to get, and what things cost.

WHAT YOU DO NOT CHOOSE
Where anything is, what anything is called in code, who has which voice, what
counts as done, the clock, the weather. Code fills all of those in. You cannot
invent a good, a trade, a name or an information key that is not printed below.
Anything you invent is rejected and the whole errand is thrown away and written
again, which the player sees as a delay.

LANGUAGE
The player is learning {{LANGUAGE_LABEL}}, written in {{SCRIPT}} script. You
write in ENGLISH ONLY. Do not write one word of {{LANGUAGE_LABEL}} and do not
write {{SCRIPT}} characters anywhere in your answer. A separate call writes all
the dialogue. Any {{SCRIPT}} text you produce here is discarded.

GOODS THAT EXIST IN THIS MARKET
Each line is: the good, the trade that sells it, and the unit it is priced in.
There is no 3D model for anything else, so an errand for anything else cannot
be played.

  tomato    vegetable seller   per kilo
  mango     fruit seller       per dozen
  masala    spice seller       per packet
  saree     cloth seller       per piece
  bangles   bangle seller      per set
  chai      tea stall          per glass
  bucket    plastic goods      per piece
  garland   flower seller      per moora
  tumbler   steel vessels      per set
  coconut   coconut seller     per piece

INFORMATION KEYS -- the only things a vendor can be made to tell a player:
  bangle_stall_location   where the bangle stall is
  chai_stall_location     where the tea stall is
  gate_direction          the way out to the Charminar
  market_closing_time     when the stalls shut
  where_from              where their goods came from today
  best_price_today        which trade is cheapest today
  festival_today          what the lights and flowers are for
  rain_shelter            where to stand if it rains

NAMES -- pick from this list only, never invent one:
{{NAME_POOL}}

THE TWO KINDS OF ERRAND
  buy  {"kind":"buy","good":"<a good above>","qty":1,"haggle":true|false,
        "title":"<3-5 words, English>","brief":"<one sentence, English>"}
  ask  {"kind":"ask","cast":"<a cast id you wrote>","info":"<a key above>",
        "title":"<3-5 words, English>","brief":"<one sentence, English>"}

MONEY
Whole rupees, and real street-market numbers for {{CITY}} today. `opening` is
what the vendor asks first. `floor` is the least they will really take, and it
is always LESS than opening -- if they are equal there is nothing to talk about.
A `haggle` errand needs real room: opening at least 20% above floor.

HARD LIMITS
- cast: one person per errand that needs one, {{CAST_MIN}} to {{CAST_MAX}} people,
  and no two people in the same trade.
- errands: exactly {{MISSION_COUNT}}, at least one `buy`. The player does them in
  the order you list them.
- An `ask` errand must come before whatever it is the player needs to know.
- quirk_en, wants_en, provokes_en: at most twelve words each, about how this
  person TALKS, SELLS or HAGGLES. Never about their religion, caste, politics,
  wealth or looks. "counts in tens and calls everyone babu" is right.
- Never name a real living person or a real named shop.

{{LEVEL_BLOCK}}

OUTPUT
One JSON object. Exactly these keys, in this order, nothing before or after it,
no markdown fence, no commentary:

{"plan":"<one sentence, English: the errand you are about to write>",
 "title":"<4-6 words, English>",
 "premise":"<two sentences, English, second person, why they are here>",
 "cast":[{"id":"<lowercase_ascii>","name":"<from NAMES>","trade":"<a trade above>",
          "voice_gender":"f|m","quirk_en":"<=12 words",
          "wants_en":"<=12 words","provokes_en":"<=12 words"}],
 "errands":[{"kind":"buy","good":"tomato","qty":1,"haggle":false,
             "title":"A kilo of tomatoes",
             "brief":"Buy a kilo of tomatoes. Ask the price first."}],
 "prices":{"tomato":{"opening":40,"floor":32}},
 "wallet":210}

`plan` comes first on purpose: say the errand in one English sentence, then
write that same errand as JSON. `prices` needs one entry for every good any
`buy` errand names.

WORKED EXAMPLE
{"plan":"Buy a kilo of tomatoes from the vegetable seller, find out from her
where the bangle stall is, then haggle for a set of bangles as a gift.",
 "title":"Tomatoes and a gift",
 "premise":"Your cousin's engagement is this evening and you were sent out with
two hundred and ten rupees. Vegetables first, then something for the girl.",
 "cast":[{"id":"lakshmi","name":"Lakshmi","trade":"vegetable seller",
          "voice_gender":"f","quirk_en":"counts in tens and calls everyone babu",
          "wants_en":"clear the crates before the light goes",
          "provokes_en":"being told her tomatoes are old"},
         {"id":"noor","name":"Noor","trade":"bangle seller",
          "voice_gender":"f","quirk_en":"will not be rushed, holds each set up",
          "wants_en":"a sale she can be proud of, not a quick one",
          "provokes_en":"handling the glass roughly"}],
 "errands":[{"kind":"buy","good":"tomato","qty":1,"haggle":false,
             "title":"A kilo of tomatoes",
             "brief":"Buy a kilo of tomatoes from Lakshmi. Ask the price first."},
            {"kind":"ask","cast":"lakshmi","info":"bangle_stall_location",
             "title":"Where are the bangles?",
             "brief":"Ask Lakshmi where the bangle stall is."},
            {"kind":"buy","good":"bangles","qty":1,"haggle":true,
             "title":"Bangles for Amma",
             "brief":"Noor opens high. Get the bangles for less than she asks."}],
 "prices":{"tomato":{"opening":40,"floor":32},
           "bangles":{"opening":220,"floor":140}},
 "wallet":210}
```

`{{LEVEL_BLOCK}}` is one of three, because the word "intermediate" carries no behaviour:

```
LEVEL: beginner
- Two errands, and the second is a short `ask`, not a second purchase.
- No haggling: set every errand's "haggle" to false.
- Prices are round: multiples of five, under one hundred.
LEVEL: intermediate
- Three errands. At least one `buy` with "haggle" set to true.
- The wallet must NOT cover every opening price. Make the player work for it.
LEVEL: advanced
- Four errands, at least two of them haggles.
- Tight wallet and wide margins: opening 40-60% above floor.
```

### 4.2 Compile — user message, verbatim

```
CITY: {{CITY}} ({{LANGUAGE_LABEL}}, {{SCRIPT}} script)
LEARNER LEVEL: {{LEVEL}}
TIME OF DAY: {{TIME_LABEL}}

WHAT THE PLAYER TYPED:
"{{RAW_SITUATION}}"

{{DIVERSITY_BLOCK}}

Write the errand.
```

`{{DIVERSITY_BLOCK}}`, present only when a prior accepted spec exists for this city:

```
THE LAST ERRAND WE WROTE FOR THIS CITY, WHICH YOU MUST NOT REPEAT:
  goods: tomato, bangles
  trades: vegetable seller, bangle seller
Choose different goods and different trades.
```

### 4.3 Compile — the shape, and its validator

```ts
export type SkeletonCast = {
  id: string; name: string; trade: Trade;
  voice_gender: "f" | "m";
  quirk_en: string; wants_en: string; provokes_en: string;
};

export type SkeletonErrand =
  | { kind: "buy"; good: GoodId; qty: number; haggle: boolean; title: string; brief: string }
  | { kind: "ask"; cast: string; info: InfoKey; title: string; brief: string };

export type Skeleton = {
  plan: string;
  title: string;
  premise: string;
  cast: SkeletonCast[];
  errands: SkeletonErrand[];
  prices: Record<GoodId, { opening: number; floor: number }>;
  wallet: number;
};
```

`validateSkeleton(spec, input): Issue[]`, hand-rolled in the spirit of `validateScenario` (`schema.ts:241-314`), because these failures are referential and a schema validator waves them through. Each issue carries `severity: "patch" | "repair" | "fatal"` — `patch` is fixed in code without a round trip, because spending 1.8 seconds of a player's life on one out-of-range integer is not a trade worth making.

```
 1  plan / title / premise are non-empty strings; premise ≤ 400 chars      fatal
 2  cast.length ∈ [CAST_MIN, CAST_MAX]                                     repair
 3  errands.length === MISSION_COUNT for the level                         repair
 4  every cast.id matches /^[a-z][a-z0-9_]{1,15}$/ and is unique           repair
 5  every cast.name ∈ NAME_POOL, exact match                               patch  → nearest, then pool[i]
 6  every cast.trade ∈ TRADES                                              repair
 7  no two cast members share a trade                                      repair
 8  every cast.voice_gender ∈ {f, m}                                       patch  → "f"
 9  every errand.kind ∈ {buy, ask}                                         fatal
10  buy.good ∈ GOODS                                                       repair
11  buy.qty ∈ 1..3                                                         patch  → clamp
12  a cast member exists whose trade sells buy.good                        repair
13  ask.cast ∈ cast ids                                                    repair
14  ask.info ∈ INFO_KEYS                                                   repair
15  at least one errand is a buy                                           repair
16  an ask whose info is a *_location precedes any errand at that trade    repair
17  prices has an entry for every buy.good, keyed by the good id           repair
18  every price: 0 < floor < opening, both integers                        repair
19  haggle:true ⇒ opening ≥ floor × 1.20                                   patch  → raise opening
20  G-WIN:  wallet ≥ Σ(floor × qty) × 1.15                                 patch  → raise wallet
21  G-PUSH: wallet < Σ(opening × qty)     [intermediate and above]         patch  → lower wallet
22  wallet ≤ 2000                                                          patch  → clamp
23  quirk/wants/provokes ≤ 12 words and pass the denylist                  patch  → trade template
24  no {{SCRIPT}} Unicode range appears in any string in the object        patch  → strip, refill
25  after expansion: validateScenario(scenario) returns no issues          fatal
26  after expansion: every mission is transitively reachable               fatal
```

Check 26 is the one `validateScenario` does not do. `schema.ts:309-311` checks only that *one* mission has zero preconditions; it does not check that the rest can ever be reached. The expansion simulates forward — start at `openingState`, for each mission in list order assume its `completeWhen` facts hold, apply effects, settle — and fails the spec if any mission is still `locked` at the end.

### 4.4 Compile — the failure ladder, with a wall clock

```
t=0     compile call. AbortSignal at 6000ms. temperature 0.3, maxTokens 1200.
        NOTE: this call passes { attempts: 1 } to withRetry. groqChat wraps every
        call (groq.ts:67) and an AbortError carries no `status`, so retry.ts does
        not fast-fail it -- it sleeps 400ms then 800ms and retries twice against
        an already-aborted signal, turning a 6s deadline into 7.2s.

 ├─ groqJson returns null (it swallows and returns null by design, groq.ts:109-135)
 │     -> straight to rung 3. Never try to repair unparseable output.
 ├─ only `patch` issues  -> fix in code, no round trip, ~0ms
 ├─ any `repair` issue   -> rung 2
 └─ any `fatal` issue, or timeout, or 403  -> rung 3

rung 2  REPAIR IS A DELTA CALL. The system message is byte-identical. The user
        message is the raw JSON plus a list naming only the wrong fields and the
        legal values, ending "Return the SAME object with ONLY those fields
        changed." maxTokens 1200, temperature 0.1, AbortSignal 3500ms, one only.

rung 3  CITY CACHE. Newest accepted skeleton for this city_id from
        sim_spec_cache. Goods are rebound to whatever stalls this build produced.
        ~80ms, and it is a real generated errand, just not this one.

rung 4  AUTHORED FALLBACK. lib/sim/fallbacks/hyderabad-bazaar.ts, written by
        hand against goods rather than slots. Zero network. Always plays.

Worst case: 6000 + 3500 + 80 = 9.6s, under the plan-reveal's 15s cover.
Best case: a pre-warmed cache hit at ~80ms, which is what happens on stage.
```

### 4.5 One turn — system message, verbatim, rendered once per session

```
You are {{NAME}}, {{TRADE}}, behind a stall in {{CITY}}.
{{TRADE_FLAVOUR}}
{{QUIRK_EN}}

WHAT YOU WANT: {{WANTS_EN}}
WHAT SETS YOU OFF: {{PROVOKES_EN}}

You are NOT a teacher. Never explain grammar, never correct the player, never
break character, never mention being an AI, never narrate yourself in brackets.
The player is learning {{LANGUAGE_LABEL}} badly and that is fine -- fumbling
your language is not rudeness and you never punish it.

WHAT YOU SELL
{{STOCK_LINES}}

HOW MONEY WORKS AT YOUR STALL
You open high and you come down, slowly, the way anyone does. You have a lowest
price you will never go under and never say out loud. You do not choose the
numbers -- you choose WHEN to come down. Say "quote" the first time you name a
price, "concede" each time you come down, "accept" when you are handing the
goods over, "refuse" when you are holding where you are.

WORDS ARE NOT DEEDS
Saying "here, take it" does not move a single rupee. Only an ACTION moves
anything, and these nine are the only actions that exist:

  greet     you are greeting them
  clarify   you genuinely could not make out what they said
  quote     you are naming your price for the first time
  concede   you are coming down
  accept    you are handing the goods over and taking the money, right now
  refuse    you are holding your price
  point     you are sending them to another stall
  tell      you are telling them something they asked about
  end       the exchange is over and they should walk on

Rules about actions:
- One action per turn. Pick the one your reply actually does.
- Never "accept" to mean "I would accept that". It means the goods change hands.
- "point" only to a stall on this list: {{POINTABLE}}
  and your reply MUST say that stall's name out loud.
- "tell" only about something on this list: {{KNOWN_INFO}}
  and your reply MUST actually contain the answer, not a promise to answer.
- "greet" or "clarify" when nothing else fits.

{{SCRIPT_BLOCK}}

OUTPUT
One JSON object. Exactly these four keys, in this order, nothing else:
{"act":"quote","target":"tomato","reply_native":"...","reply_roman":"..."}
- act:          one word from the nine above.
- target:       the good, the stall or the information key your action is about.
                Write "" when your action needs no target.
- reply_native: ONE or TWO short spoken sentences in {{SCRIPT}}. A voice reads
                this aloud, so write how a person in a market really talks.
- reply_roman:  the same line in Latin letters, for the subtitle.
```

`{{SCRIPT_BLOCK}}` is `lib/game/prompt.ts:121-133` ported to `Scenario`, worked examples and all, placed last. That file's comment records that telling the model "use Devanagari" did not hold and feeding it the phrasebook as worked examples, last, did. Same trick, same position, Telugu lines from `AMBIENT_LINES['te-IN']` (`market-life.js:91-94`).

Four flat string fields. No arrays, no nested objects, no integers. That is the shape `JSON_SHAPE` at `prompt.ts:23` has already been fought into stability on this model, and it is why the streaming vet is cut (section 8).

### 4.6 One turn — user message, verbatim, rendered every turn

```
RIGHT NOW
It is {{CLOCK_LABEL}}. {{WEATHER_LINE}}
{{VISIBLE_FACT_LINES}}
{{DISPOSITION_LINE}}
{{RECENT_WORLD_LINES}}
{{REJECTION_LINE}}

TALKING SO FAR
{{TRANSCRIPT_TAIL}}

THE PLAYER JUST SAID
{{PLAYER_LINE}}
```

`{{VISIBLE_FACT_LINES}}` is the `knows` filter, which is the mechanism `schema.ts:108-111` describes and which nothing in the repo currently consumes:

```
include ⟺ visibility === "all"
        ∨ (Array.isArray(visibility) && visibility.includes(characterId))
        ∨ character.knows.includes(key)
exclude always: visibility === "player"
```

Rendered type-directed, which is exactly why code owns fact labels: `number|string → "- {label}: {value}"`, `true → "- {label}"`, `false → "- {label} — not yet"`, `null → omitted`. `schema.ts:62-66` is explicit that handing a model `restaurant.mushroom_pasta = false` is how you get an NPC cheerfully serving a dish that does not exist.

`{{DISPOSITION_LINE}}` is patience rendered as behaviour, never as a number:

```
patience 3+   (omitted)
patience 2    You have other customers waiting. Keep it short.
patience 1    You are close to giving up on this one. One more sentence.
```

`{{RECENT_WORLD_LINES}}` is the last three applied mutations on `visibility: "all"` facts, as English sentences — "Someone just bought a kilo of tomatoes from Lakshmi." That is the cross-character consistency channel research §4.6 requires, and it is a filter over `state.log` for `kind: "fact"` on public keys through the same label renderer.

`{{REJECTION_LINE}}` appears only after a hard rejection, so the model corrects instead of repeating: "Last turn you tried to hand over the bangles for less than you will take. Nothing happened."

### 4.7 One turn — validation and fallback

```
1  groqJson -> null?            speak REFUSALS[lang].not_heard. The clock does NOT
                                advance, patience is untouched, the turn is logged
                                with nullTurn: true. An engine failure must never
                                cost the player a stake.
2  act ∉ the nine verbs         treat as `greet`, keep the reply.
3  soft act, target illegal     drop the action, keep the reply.
4  hard act fails a precondition
                                DISCARD the reply. Speak the templated refusal.
                                Log kind:"reject" with the reason.
5  reply_native fails
   looksLikeTargetScript        one retry at temperature 0.1 with the script block
   (prompt.ts:49)               repeated; on a second failure speak the vendor's
                                cached opening line instead. Never speak Latin.
6  reply_native > 200 chars     truncate at the last sentence boundary.
```

`REFUSALS['te-IN']`, hand-written, never generated — the same argument `market-life.js:85-89` makes about `AMBIENT_LINES`, and it lands harder here because a refusal fires precisely when the model has already misbehaved, which is the worst possible moment to ask it for a string.

```
below_floor    అంత తక్కువకు కుదరదు సార్.      Anta takkuvaku kudaradu sir.
no_money       డబ్బులు సరిపోవు సార్.          Dabbulu saripovu sir.
no_stock       అయిపోయాయి సార్, రేపు రండి.     Ayipoyaayi sir, repu randi.
not_my_goods   అది ఇక్కడ దొరకదు సార్.         Adi ikkada dorakadu sir.
dont_know      నాకు తెలియదు సార్.             Naaku teliyadu sir.
not_heard      ఏమన్నారు?                      Emannaaru?
no_assent      ఏంటి? సరిగ్గా చెప్పండి.        Enti? Sariggaa cheppandi.
```

`no_assent` is the one the player will hear most and it is the teaching moment: the vendor did not understand you well enough to act, so say it again, in Telugu. No correctness meter appears on screen — research rule 7 holds.

---

## 5. Scoring

### 5.1 The split

```
OBJECTIVE  85   pure function, zero model calls, byte-identical on replay
  mission  50   did you get what you came for
  language 25   did you do it in Telugu, and did you listen
  thrift   10   did you haggle

SUBJECTIVE 15   one Groq call, after the run, closed enums only,
  register 7.5  clamped to within ±0.34 of the objective language score
  comprehensibility 7.5
```

Weights are a module constant in `lib/sim/score.ts`, **not** a field on `Scenario`. `Scenario.evaluation` (`schema.ts:191`) is compiler output, and a rubric living there is a language model writing its own exam. It keeps display copy only.

Every component declares `applicable`; the total renormalises over the applicable weights. A scenario with no haggle drops `thrift` rather than carrying ten dead points.

### 5.2 The counters

Derived, never stored, as a pure function of `(scenario, state.turns, state.facts, state.missions)`. Stored derived state goes stale the first time someone fixes the derivation. `WorldState` gains `turns: TurnRecord[]`, written once per player turn by the turn route, because the fact surface cannot hold history: `FactValue` is a scalar, `Condition` is equality-only, and `state.log` is heterogeneous narrative.

```ts
export type TurnRecord = {
  n: number; at: number; clock: number; characterId: string;
  input: "voice" | "text";
  said: string;                 // the transcript exactly as received
  tokens: number;
  sttOk: boolean;               // false = we could not hear them
  sttError: string | null;
  silent: boolean;              // sttOk && tokens === 0
  assent: { phraseId: string; accuracy: number } | null;
  distinctContent: boolean;     // carries a content token no earlier turn had
  act: string | null;           // the vetted act that landed
  rejected: { act: string; reason: string } | null;
  nullTurn: boolean;            // groqJson returned null; excluded from everything
  latencyMs: number;
};
```

`sttOk` is not optional. `sarvamSTT` returns `json?.transcript ?? json?.text ?? ""` (`lib/sarvam.ts:82`), so a 200 with an empty transcript is byte-identical to silence at the record level. On venue wifi, with an Intel UHD laptop and a presenter speaking Telugu into a browser mic, the most likely demo failure is a run of empty transcripts — and a scorer that cannot tell them from silence shows the judges a zero and tells the presenter they did not speak. If more than a third of turns have `sttOk === false`, the score is suppressed entirely and the screen reads "We could not hear you — here is what we did get", which is an honest screen instead of a false accusation.

### 5.3 The objective formula

```
M  = Σ reward over complete missions / Σ reward over all missions
                                                              applicable always

L  = ( 0.45·assentRate + 0.30·phraseCoverage + 0.25·repairRate ) / Σ applicable

     assentRate     = assentTurns / max(1, productiveTurns)
     phraseCoverage = (hits + 0.5·partials) / phrasesOfReachedMissions
     repairRate     = recoveries / clarifies            n/a when clarifies === 0

T  = mean over completed buys of clamp01( (opening − paid) / (opening − floor) )
                                              applicable only when ≥ 1 buy landed

total = 100 · ( 50·M + 25·L + 15·S + 10·T ) / Σ(applicable weights)
```

Definitions that were got wrong in the inputs and are fixed here:

- **`productiveTurns`** excludes `nullTurn` and `!sttOk` turns. An engine failure is not a player behaviour.
- **`assentTurns`** are turns whose `assent` is non-null. Because assent is `scoreAttempt` against a native-script phrase, this is also the English detector, and it is immune to the transliteration failure that would invert a script-ratio check.
- **`phrasesOfReachedMissions`** is the denominator, not all phrases offered. A phrase belonging to a mission that stayed `locked` was never offerable, and charging for it double-charges a failure already paid for in `M`. `partials` (0.55–0.72) excludes any id already counted in `hits` (≥ 0.72).
- **`clarifies`** counts only a *vetted* `clarify` act, not a model boolean. The scoring proposal fed the model's bare `confused` flag into the denominator of a scored ratio, which let the model set both halves of it. Routing it through the action vocabulary puts it on the same enforcement path as everything else.
- **`recoveries`** requires the next turn to carry at least one content token absent from the confused turn, **and** either a higher `assent.accuracy` or a different `phraseId`. The original definition — `previousWasConfused && repeatOf === null && !nowConfused` — inverts: a learner who genuinely rephrases trips the repeat check and scores zero, while a reciter who ignores the NPC entirely and fires the next scripted phrase scores a free recovery.
- **`hits` at 0.72** matches `verdictFor` (`speech-score.ts:51`) exactly, so the sim's meter and the lesson path's meter can never disagree. The partial floor is 0.55, not `speech-score`'s 0.40 yellow, because taking a max over six to eight candidate phrases inflates the expected maximum.

### 5.4 The four gates

Composed by `min()`, never subtracted. Additive penalties are how a score becomes unreadable and how the same sin gets charged three times.

| gate | condition | ceiling |
|---|---|---|
| A1 | `productiveTurns === 0` and STT was healthy | **0**, and no Groq call |
| A2 | `assentRate < 0.15` | **25** |
| A3 | `phraseHits === 0` | **40** |
| A4 | `distinctContentTurns / productiveTurns < 0.25`, floor of 2 | **35** |

A4 is a rate with a floor, not the bare count of two the scoring proposal specified — two words across an eleven-turn run is a threshold anyone clears by accident and any deliberate gamer clears on purpose.

### 5.5 Worked: the demo run and three cheaters

The demo scenario from section 6. Three missions, rewards 40 / 20 / 40.

**Honest strong run.** All three complete → `M = 1.000`. Eleven productive turns, eight with assent → `assentRate = 0.727`. Six phrases across reached missions, four hits and one partial → `coverage = (4 + 0.5)/6 = 0.750`. One clarify, one recovery → `repairRate = 1.000`.

```
L = 0.45(0.727) + 0.30(0.750) + 0.25(1.000) = 0.327 + 0.225 + 0.250 = 0.802
T: tomato paid 35 of [40..32] = 0.625 ; bangles paid 180 of [220..140] = 0.500
   mean = 0.5625
S: register "ok" (0.8), comprehensibility "mostly" (0.67) -> 0.735
   clamp to L ± 0.34 = [0.462, 1.000] -> 0.735
total = 50(1.000) + 25(0.802) + 15(0.735) + 10(0.5625)
      = 50.00 + 20.05 + 11.03 + 5.63 = 86.7 -> 87   "Like a local"
```

**Honest weak run.** Two of three (40 + 20 of 100) → `M = 0.600`. `assentRate 0.55`, `coverage 0.40`, two clarifies and no recovery → `repairRate 0`. Paid the opening on the one buy → `T = 0`.

```
L = 0.45(0.55) + 0.30(0.40) + 0.25(0) = 0.3675
S: 0.735 clamped to [0.028, 0.708] -> 0.708
total = 30.00 + 9.19 + 10.61 + 0.00 = 49.8 -> 50   "Getting through"
```

**Cheater C1, English throughout.** This is where the assent gate changes the shape of the answer. No Telugu utterance aligns with a Telugu phrase, so no `accept`, `tell` or `point` can ever pass. `M = 0`, `assentRate = 0`, `coverage = 0`, `T` not applicable.

```
L = 0
S: clamped to [−0.34, 0.34] -> at most 0.34
total = (0 + 0 + 5.10) / 90 × 100 = 5.7 -> 6
```

Gate A2 would cap this at 25 and never binds, because the structure already answered it. The scoring proposal needed a gate here precisely because its missions *could* complete in English; under the assent gate they cannot. That is a better answer than a cap and it is worth saying out loud to a judge.

**Cheater C2, recites one phrase eleven times.** `assentRate 1.000` — the reciter genuinely is speaking Telugu. But the recited phrase is an ask-class phrase, so it assents to the price question forever and never to the close: no mission completes, `M = 0`. One distinct phrase → `coverage = 1/6 = 0.167`. Three clarifies, no recovery → `repairRate 0`. One distinct content turn of eleven → A4 fires.

```
L = 0.45(1.000) + 0.30(0.167) + 0.25(0) = 0.500
S: register "ok", comprehensibility "some" -> 0.565, clamp [0.16, 0.84] -> 0.565
raw = (0 + 12.50 + 8.48) / 90 × 100 = 23.3 -> 23   (A4's cap of 35 never binds)
```

**Worst honest run 50. Best cheater 23.** A twenty-seven point gap with no overlap. The gap is wide because the assent gate moved cheating out of the "capped" regime and into the "earned nothing" regime, which is where it belongs. These four numbers must still be re-derived against recorded fixtures before they are quoted on stage — the scoring proposal's own cheater table had an arithmetic contradiction in the row meant to prove its clamp, and a table nobody has run is a table nobody should cite.

### 5.6 The judge

**Once, at the end of the run.** Not per turn. Research §4.6 says flatly that no grader sits in the live loop, a per-turn judge violates the one-blocking-call budget of §3.6 rule 6, and it would roughly double turn latency on a live microphone. Live feedback is not lost, because live feedback is already model-free: the NPC's in-character confusion, the per-word colouring from `scoreAttempt` that `components/Dialogue.tsx:88` already does with no model call, and a HUD that moves when the world moves.

It sees an evidence packet, never the raw log: the register rule for this language from a code-held table (register is a property of Telugu, not of this bazaar); the deterministic facts pre-computed; at most twelve player turns chosen by a pure function (the first two, the last two, and up to eight highest-information turns — any turn with a rejection, a clarify, an applied mutation, or a near-miss assent in 0.55–0.72), ties broken on index; the demoted `debriefCriterion` prose as colour; and **no scores and no numbers it could copy back**.

It returns labels and one thing only a model can write:

```json
{"register":"ok",
 "comprehensibility":"mostly",
 "better_ways":[{"turn":9,"try_native":"...","try_roman":"...","en":"..."}],
 "best_moment_turn":11,
 "practice_next":"politeness"}
```

`register ∈ rude | too_familiar | ok | warm → 0 | 0.4 | 0.8 | 1.0`. `comprehensibility ∈ none | some | mostly | clear → 0 | 0.33 | 0.67 | 1.0`. `S = clamp(0.5·register + 0.5·comprehensibility, L − 0.34, L + 0.34)`.

Four validation rules on the way back, because Panel 5 is the highest-value screen in the product and a card showing a learner a sentence they never said is worse than no card:

1. Drop any card or citation whose `turn` is outside `[1, turns.length]`.
2. **Never render the model's quotation of the player.** Render `turns[turn].said` from the ledger.
3. Drop any card whose `try_native` fails `scriptRatio ≥ 0.9`. `looksLikeTargetScript` (`prompt.ts:49-53`) is a bare `pattern.test`, so one Telugu character anywhere passes it — "Give it for ధ" would be accepted on the one string a learner will copy.
4. `summary_en` and `summary_native` are **not** the model's job. Panel 1 is templated from `spend`, `walletEnd` and mission state, which is what it already describes. That shrinks the object, concentrates the budget on `better_ways`, and removes the most likely truncation.

`maxTokens: 1500`, temperature 0.1, `format: "json"`. Not 700: the object carries Telugu, Indic tokenises at three to five tokens per word on this tokeniser, and when it truncates `groqJson`'s salvage (`groq.ts:123-130`) closes on a nested `better_ways` card and returns null with a `console.warn`. Measure the real cost before Day 8 and set it to twice the worst case.

If the judge fails, `register` drops from the applicable weights and the debrief renders deterministically. **The debrief can never fail to appear.** Dropping it makes scores slightly harsher, which is the safe direction.

The run is claimed before the judge is called: a single conditional update setting `run.status` from `open` to `settled` and bumping `version`, and only the writer that wins it makes the Groq call. `WorldState.version` (`schema.ts:226`) exists for exactly this documented race. Without it, a double-click or a React StrictMode double-invoke gets two judge results and a free re-roll of the one number the design says is frozen.

`scoreRun(scenario, state, judge, now)` takes `now` as a parameter so it is genuinely pure and the byte-identical-on-replay unit test that runs on every commit can actually pass.

### 5.7 What the learner sees

Seven panels, and the number is sixth.

1. **The story, in two sentences.** Instant, objective, templated, with the Telugu line read aloud in the vendor's own voice. *"You got the tomatoes for ₹35 and the bangles for ₹180. Your wallet is down to ₹2 and Lakshmi called you babu."*
2. **The mission card resolving, each row citing the fact that settled it.** `✓ A kilo of tomatoes — bag.tomato = 1, paid ₹35 of an opening ₹40`. This panel is the visible proof of the locked principle and it is worth the judges' fifteen seconds on its own. Build it first.
3. **The three checks**, one line of evidence each. Two are decided by code (`tried the target language` from `assentRate ≥ 0.5`; `recovered when misunderstood` from `repairRate ≥ 0.5`, or N/A). One is the judge's and is display-only — its deterministic shadow is already inside `L` and charging twice is the double-count this design refuses everywhere else.
4. **Your Telugu.** `Spoke Telugu in 8 of 11 turns · used 5 of 6 phrases · misunderstood once, recovered · haggled ₹45 off`. Every number here is arithmetic, and every phrase is tappable.
5. **Better ways.** At most three cards: what you said → try this → what it means.
6. **The number with a band.** `87 · Like a local`. Bands: 0–24 *First words* · 25–44 *Found your feet* · 45–64 *Getting through* · 65–84 *Held your own* · 85–100 *Like a local*. A word gets repeated to a friend; a number gets compared.
7. **One sentence: what to practise next**, authored per `(practice_next, language)`, never model prose. *"You used ఇవ్వు with a vendor twice your age. ఇవ్వండి is the form that keeps a bazaar friendly."*

There is no red. The lowest band is *First words*, and the all-English debrief leads with "Every errand attempted — none of it in Telugu. Here is the same run in Telugu:" followed by three cards.

What leaves the session is `xp = max(0, objective85 − bestPreviousForScenarioId)`. **The judge's fifteen points never reach the persistent economy** — they are display. That removes model output from a public leaderboard entirely and costs the learner nothing they can perceive. The wallet is diegetic and never mints cash into the shipped game's economy (`components/Game.tsx:465`); a sim that could print rupees into the district game is a second, worse gaming surface.

---

## 6. Stakes and engagement

### 6.1 The real numbers

```
clock       startMinutes 1120 (6:40pm), rate 3
deadline    1140 (7:00pm)  = 20 in-world minutes = 6m40s of real time
last call   1135 (6:55pm)  = the closing rush
wallet      210
prices      tomato  opening 40   floor 32   ladder [40, 35, 32]
            bangles opening 220  floor 140  ladder [220, 180, 140]
            Σopening 260 ; Σfloor 172
G-WIN       210 ≥ 172 × 1.15 = 197.8   ✓
G-PUSH      210 < 260                  ✓  you are ₹50 short of paying both askings
patience    3 per vendor, grace 3 turns
cooldown    90 in-world seconds (demo scenario pins 20), return at patience 1,
            opening raised 10%
```

Six minutes forty of real time against a run of roughly nine to eleven exchanges. At a measured turn of eight seconds that is 88 seconds of model, plus walking, plus the player composing sentences in a language they do not speak — comfortably inside, with room for one cooldown. **This number is a guess until one real turn is measured end to end.** If a turn comes in above ten seconds, raise `deadlineMinutes` rather than cutting a mission, and pause the in-world clock while a Groq call is in flight so an API hiccup can never fail a mission.

### 6.2 Patience

Decremented only on engine-detectable events, never proposed by the model:

| trigger | detection | cost |
|---|---|---|
| no progress | a turn at this vendor with no assent and no applied mutation, after `patienceGraceTurns` consecutive such turns, then every second one after | −1 |
| repeated clarify | `clarify.<cast>` reaches 3 | −1, and resets the counter |
| second return | the player walks away mid-deal and comes back for the second time | −1 |

Never: bad grammar, wrong script, a mis-transcription, a null turn, asking the price twice, or asking for something the vendor does not stock. `lib/game/prompt.ts:111-112` already commits the product to never punishing someone for speaking the language badly and that commitment is inherited literally.

At patience 1 the vendor's context gains one clause and their name chip shows one amber Telugu word: **విసుగు** (*visugu*, annoyed). One word, in the target language, at most once per run. That is the entire warning system — no bar, no meter, nothing that turns a person into a gauge.

At patience 0: `away.<cast> = true`, the interactable is removed, one templated line is spoken, `faceToward` stops being called. Ninety in-world seconds later they are back at patience 1 with a ten percent higher opening. **No mission state changes.** Failure is a tax and a cooldown, and it teaches the single most useful thing a stuck learner can learn — walk away, do something else, come back — which no drill app can teach because no drill app has a lane to walk down.

### 6.3 Recovery: you can always finish

`ground_sheet` exists in the kit (`stalls.js:625`) and `DEFAULT_STALLS` already spaces three down the lane (`bazaar.js:106-113`). Every produce `buy` mission compiles with a ground-sheet fallback selling the same good at `round5(floor × 0.85)`, fixed and non-negotiable, writing `bag.<item>.grade = "cheap"`. The 0.85 is load-bearing: the cheap route must beat a bad haggle and lose to a good one, or nobody haggles.

For everything else, when `wallet < ladder[rung] × qty` and the player has assented to a close, the engine — not the model — unlocks one extra legal act for that vendor: `accept_small`, which sells the smaller version at `wallet − 5` and writes `grade: "small"`. The gate is on the *quoted rung*, not on the floor; gating it on `wallet < floor` strands every player whose wallet sits between the floor and the current rung, which in the demo is a ₹40 window.

Both recovery paths are scored in a lower tier than a real haggle and can never outscore one. Non-mission spend — the chai you bought because you wanted to — is excluded from the money number entirely and surfaces in the debrief as colour.

### 6.4 The shape of a three-minute run

**0:00–0:15.** Three things must be true before the player takes a step: the mission card shows two or three lines each carrying one Telugu noun; the wallet reads ₹210; and the first target is marked. The marker is **a single additive vertical quad at the bound stall's customer spot**, 3.5 m tall, 12–15% opacity, gently pulsing, added straight to the scene and never absorbed.

It is not the festoon bulbs. `buildFestoon` (`bazaar.js:1011-1037`) lays spans across the *lane* at fixed z every 8 m — `for (let z = LANE_Z0 + 6; z < LANE_Z1 - 2; z += 8)` — with nine bulbs strung across the lane width. The spans have no relationship to stall positions, so "brighten the mission stall's bulbs" would brighten a lane-wide bar over two to four stalls, usually including the wrong one. Nor can the stall itself be highlighted: `bazaar.js:777` does `this.statics.absorb(group)` and the `group` kept at `:786` is never added to the scene, so any per-stall material change means pulling that stall out of the static merge and spending draw calls on the budget the merge exists to protect. The quad is one mesh, one draw call, per-mission by construction. Test it at 30 m on the demo laptop before committing.

**0:15–0:45, the approach.** The porter crosses. The cow is in the way at the first crossing (`crowd.js`, placed at `bazaar.js:1085`). `Talk to లక్ష్మి (E)` appears at 2.4 m. **The NPC speaks first, always**, from a pre-synthesised opening — a learner facing a silent NPC and a hot mic is the scariest four seconds in this product, and it must cost zero latency.

**0:45–2:30, the middle, containing exactly one thing the player did not expect.** One twist per run, chosen by the compiler from a closed enum, never by the turn model. Three surprises in a hundred seconds is noise; one is a story. For this build the enum has one member that is implemented — `tourist_price`, where one vendor's ladder starts one rung higher until the player produces any phrase of that mission at accuracy ≥ 0.60, at which point the engine drops it. Tomatoes open at ₹58; you say `కిలో ఎంత?`; they open at ₹40. **₹18 for one sentence, on screen, in under a second.** That is the whole product compressed into one mechanic and a judge who speaks no Telugu understands it without narration.

**2:30–2:50, the ending.** The run ends when the last mission completes, not when the player presses Finish. Hold on the world for 1.5 seconds — let them watch the bag fill and the wallet settle — then slide in the debrief. The last mission is always the gift, because you should end a run buying your mother bangles, not buying tomatoes.

### 6.5 The three retellable moments

1. **"I offered less, she said no and came back at thirty-five — and the rupees actually moved."** The counter must land inside four seconds and the wallet must *animate* down. A snapping number reads as a UI update; a ticking number reads as a payment.
2. **"It quoted him a tourist price until he said the sentence in Telugu. Then the price dropped. You could watch it drop."** The one moment where speaking the language and winning are visibly the same event.
3. **"She didn't sell bangles. She said the shop's name out loud and it lit up at the far end of the lane."** This one sells the world — it proves there is a *place*, not a menu. And because `point` only writes its fact when the reply actually contains the board name, what lights the marker is a sentence the player heard.

Free, and already shipping: *"there was a cow in the way and I had to walk around it."*

### 6.6 What sells the second run

Not the score. One line:

> **You paid ₹35. Her lowest was ₹32. Three rupees on the table.**
> Try: *"చాలా ఎక్కువ, ముప్పై చేయండి"* — chala ekkuva, muppai cheyandi

The player now knows a better run exists, knows exactly what it is worth, and has been handed the sentence that would have got it. The button says **"Same errand, new bazaar."** One compile call, and the second run is faster *and* cheaper — which is what "engaging means fast to complete" looks like in data.

Cross-run persistence is one `RunSummary` in `localStorage`, read by exactly two things: the anti-repetition gate, and one line on the pre-run card — *"Last time you paid ₹7 over. Beat it."* No XP bars, no levels, no unlock trees. A judge sees one run, maybe two; meta-progression is invisible in three minutes and costs a Postgres table that does not exist.

---

## 7. What to build, in order

Sizes are honest. This is a hackathon, one developer, an Intel UHD laptop and a 27B model.

**1. `lib/sim/schema.ts` — the mission type.** ~40 lines. `MissionNode` gains `completeWhen: Condition[]`, `failWhen: Condition[]`, `failEffects: Mutation[]`, `keyPhrases: string[]`, `template`, `parTurns`. `criterion: string` becomes `debriefCriterion?: string`. `Scenario` gains `phrases: PhraseSpec[]`, `stakes`, `slotBindings`. `SimEvent.kind` gains `"action" | "reject"` — today rejections are returned by `ApplyResult` (`state.ts:38`) and never logged, so the debrief cannot see that the model tried to sell below the floor. `WorldState` gains `turns`, `run`, `score`. Bump `SCENARIO_VERSION`. **Do NOT add a `compare` variant to `Condition`** — see section 8. *Unblocks: everything.*

**2. `lib/sim/state.ts` — `settle()` and a clock that moves.** ~60 lines. `settle()` per the contract in 2.4, over active missions only, doing the reward arithmetic itself. `advanceClock` bumps `version` and is followed by a settle pass — today it does neither and nothing calls it (`state.ts:187-189`), so `{kind: "clock", afterMinutes}` fires only by luck when an unrelated mutation happens to run, and the deadline is not merely unimplemented but inert. `recordSay` bumps `version` (`state.ts:216` is the one writer that does not, and under the concurrent-writer design at `schema.ts:208-215` a transcript append can be silently lost). Rejections append to the log. Add one unit test: a fresh `openingState` has zero missions in state `failed`. *Unblocks: stakes, the deadline, the debrief's transcript.*

**3. `lib/sim/actions.ts` — the enforcement point.** ~220 lines, and it does not exist today. The nine verbs of 3.4, the assent gate, the ladder arithmetic, the answer-token check, the patience decrementer clamped at zero, the refusal templates. This is where the model's proposal meets the engine. *Unblocks: any mission completing at all.*

**4. `lib/sim/systems/market-life.js` + `lib/sim/archetypes/bazaar.js` — make keepers addressable.** ~60 lines. Keepers are bare object literals pushed onto `this.agents` at `market-life.js:284-300` with no id, no name and no `faceToward`, so `SimHost.talkTo`'s optional-chained `character.faceToward?.()` at `SimHost.js:227` silently does nothing. Give each keeper a stable id and name, register an interactable per keeper (`BaseWorld.addNPC` at `BaseWorld.js:46-56` already does exactly this at radius 2.4 with the label and action), add `faceToward`, add `required` kinds to `buildStalls`, add the post-build slot binder, emit `SimLocation[]` from the customer spots (`market-life.js:196-204` already computes that point). *Unblocks: pressing E on a shopkeeper.*

**5. `app/api/sim/turn` + `components/play/TalkPanel.tsx` + `onTalk` in `PlayWorld.tsx` — ⭐ THE LOOP.** ~350 lines across three files. The route: render context, call `groqJson`, vet the act, apply mutations, settle, advance the clock, persist, return state. `PlayWorld.tsx` constructs `SimHost` with only `onProgress/onLocation/onPrompt/onStats` (`PlayWorld.tsx:82-90`), so an `onTalk` hook goes in beside them. The panel: hold-to-speak via `lib/useVoice.ts`, typed input of equal standing, three suggested phrases, subtitles.

> **This is the step that makes the product playable end to end**, and it is the one that matters most. Run it against a hand-authored `lib/sim/fallbacks/hyderabad-bazaar.ts` — no compiler, no session table, no score. At the end of this step a person can walk up to Lakshmi, ask the price in Telugu, hear ₹40, be refused at less, agree at ₹35, and watch the wallet drop and a card turn green from a fact. Everything before this is scaffolding and everything after is amplification. If the build runs out of time anywhere, it runs out after this.

**6. The HUD in `PlayWorld.tsx`.** ~80 lines. Wallet, the wall clock from `clockLabel()` (`state.ts:243`), and two or three mission chips. Rendered exclusively from returned server state, per research §4.6. Nothing else — no patience bar, no accuracy meter.

**7. `lib/sim/score.ts` + `lib/sim/phrases.ts` + `components/play/Debrief.tsx` (panels 2, 4, 6).** ~250 lines. The pure scorer, `bestPhrase()` wrapping the shipped `scoreAttempt`, and the three panels that read only facts and missions. No judge yet, no `better_ways`, no per-phrase TTS. Panel 2 alone — each mission row citing the fact that settled it — is the demo's proof of the principle.

**8. `lib/sim/compile/*` + `app/api/sim/compile`.** ~400 lines. The catalogue, the two prompts of section 4, the twenty-six checks, the expander that owns every fact key and label, the four-rung failure ladder, the authored fallback. Pre-warm `sim_spec_cache` with the demo prompts at deploy — `supabase/migrations/012_sim_sessions.sql:43-45` says in its own comment that this is what the table is for, and it is the actual insurance against Groq being down at 11:04 on stage.

**9. `app/api/sim/debrief` + panels 1, 3, 5, 7.** ~200 lines. The evidence packet, the judge call, the four validation rules, the authored practice lines.

**10. Stakes and polish.** ~150 lines. The `tourist_price` twist, the last-call bark pool, the recovery paths, the marker quad, the cooldown.

Steps 1–5 are the product. Steps 6–7 are the proof. Steps 8–10 are the pitch. If only 1–7 land, the demo is "here is an errand we wrote by hand, played end to end, and here is the engine refusing the model" — which is a smaller claim, honestly made, and it will beat a compiler that hangs.

### 7.1 Nineteen strings of new Telugu

Every stake and friction mechanic in this document costs nineteen hand-written Telugu strings: seven refusals (4.7), three closing-rush barks for a new `AMBIENT_LINES['te-IN'].closing` pool, one HUD word (విసుగు), and eight key phrases per demo mission set. Hand-written, never generated, for the reason `market-life.js:85-89` gives. **Every one must be read by a Telugu speaker before the demo.** The ones to check hardest are the refusals, because they fire at the exact moment a judge is watching the engine overrule the model.

---

## 8. What we are deliberately not doing

**Adding `compare` to `Condition`.** `conditionHolds` (`state.ts:49-58`) is a two-way ternary over the fact union: `"equals" in c ? state.facts[c.key] === c.equals : state.facts[c.key] !== c.notEquals`. A `{compare: "lte", value: 0}` condition has no `equals` key, falls into the `notEquals` branch, and evaluates `state.facts[key] !== undefined` → **true for any defined fact**. Every `failWhen` would hold at t=0 and the run would auto-fail at the spawn point, silently, in the one code path nothing currently exercises. The fix is easy — an exhaustive switch on a proper discriminant — but the milestone-fact approach needs no fix at all, evaluates each threshold once in the code that owns the arithmetic, and records *why* a mission passed where the debrief can read it. Not adding it for the demo; add it later if something else genuinely needs it.

**`quote_price{item, price}` with a numeric operand**, as research §4.5 specifies. Its only guard is `floor <= price <= opening`, which on the demo's tomatoes is a thirty-rupee window. Inside it the model can quote the floor on turn one and collapse the haggle, or never reach the floor and strand a player whose wallet sits between the floor and the last quote. The three-rung ladder is a tightening of a decision already made, not a reversal of it, and it removes every integer from the model's output.

**`planQuarter()` and pre-build slot ids.** The context lens proposed extracting the lane arithmetic into a pure pre-pass so the compile prompt could carry slot ids. It cannot share the RNG: `Bazaar` has one stream (`bazaar.js:145`) and the bay loop consumes draws for floor counts, building seeds and palette picks before it ever pushes a `stallSlot` (`:451-456`), so a planner that skips the mesh draws advances the stream differently and gets a different keep sequence — `p3` in the prompt is not `p3` in the world. Splitting the stream into `planRand`/`dressRand` is the correct refactor and it is a day that touches the constructor's control flow across four methods. Post-build binding plus a `required` kinds list is five lines and gets the same guarantee. The model names a *good*; code finds a stall.

**Streaming the turn and vetting `actions` as the array closes.** `groq.ts:121-122` records that under `json_object` some turns arrive wrapped in prose or a fenced block, which is why `groqJson` has a whole-response brace salvage. A prefix parser keyed on "the array closed" either misfires on a fenced prefix or never fires, and the salvage it would need is by construction not incremental. Take the full response, salvage, vet, apply — about 250ms of subtitle latency against a natural conversational pause, and it buys back a partial-JSON parser nobody has time to get right. `act` stays the first key anyway; it still improves the model's ordering of thought.

**Seven task families.** ACQUIRE and BARGAIN collapse into `buy` with a flag. ELICIT and ROUTE collapse into `ask`. SPECIFY, REDRESS and DECLINE are real and well-designed and are not built: each needs a new verb (`note_detail`, `settle_change`) plus its own precondition surface, and three extra verbs is three extra ways for the demo to break. REDRESS in particular had an elegant argument — `overcharge` as `visibility: "player"` means the model can only produce the number by transcribing the player — but `settle_change{amount}` is strict equality on a model-produced integer parsed out of a Telugu numeral word recovered from STT, which is the most brittle binding anyone proposed, and a rejected attempt carried no cost so the model could brute-force across turns.

**`gift` / `deliver` as a mission kind.** No action in the vocabulary hands an item over, and no `completeWhen` was ever specified for it. It was in one proposal's compile prompt and mandated by its advanced level block, which would have guaranteed that every advanced spec contained a mission that could neither complete nor fail — and the transitive-reachability check would not have caught it, because that check proves the graph is connected, not that a node is achievable by a player.

**Rewriting `lib/sim/scenarios/jaipur-date.ts`.** It is declared legacy at `SCENARIO_VERSION 1` and left untouched. The "forty-line rewrite" was not forty lines: the facts its prose criteria would gate are written by the effects of the very missions that would gate on them (`jaipur-date.ts:311`), so the conversion is circular, and four of its six criteria — "greeted Priya in Hindi *and* acknowledged that she was waiting" (`:322`), "the player must have asked; her volunteering it does not satisfy this" (`:333`) — have no mechanical proof at all under a bazaar-shaped action vocabulary. It exists to be the fallback, and a half-converted fallback is worse than none.

**Time pressure as a difficulty dial.** `clock.rate` is 3 in every band. Resource-dispersing complexity degrades performance without producing development; the clock is there for stakes.

**"Rupees saved" as the headline metric.** It was the best-argued line in the engagement proposal and it is exploitable: `rupeesOverFloor = paid − Σfloor` is negative when a recovery path sells below the floor, so a player who deliberately burns money on chai until the small-version path unlocks scores as having *beaten* the floor. Worse, it punishes exactly the exploratory, language-producing purchase the product wants. Rupees-over-floor survives as a per-mission, clamped-at-zero line in the debrief — which is where its real power was anyway.

**A patience failure that fails a mission.** See 6.2. `MissionState` has no path back from `failed`, so it strands the run; and because the last mission is always the gift, the one vendor whose patience failure is structurally unrecoverable is the one the design deliberately puts last.

**A per-turn judge, an on-screen accuracy meter, meta-progression, a second language in one world, and eight of the eleven `LangCode`s.** Each for a reason given above.

---

## 9. Open questions for you

**Does a failed mission score zero, or partial?** Under this design the only way to fail is the deadline, which makes failure rarer and more legible than the four proposals assumed. Zero is simpler and makes the clock bite. Partial credit scaled by how many `completeWhen` conditions were holding at the moment the clock ran out is kinder and needs `settle()` to write a progress fact. My recommendation is zero, because with patience demoted to a cooldown the only way to fail is to run out of time, and that is a failure the player could see coming.

**Is a failed or abandoned mission shown as failed mid-run, or only in the debrief?** Research rule 7 forbids a correctness meter mid-conversation, but a mission chip going grey is arguably not a correctness meter. I lean toward showing it, because the deliberately tight wallet only pays off if the player can see the bangles slipping away. This is a product call with a real pedagogy consequence.

**Does the player pick their band, or is it inferred?** I have assumed the situation page asks, worded as intent and never as a level — "Buy vegetables for dinner" is the beginner chip, "Sunday shopping, and a gift to find" is intermediate. If it is inferred from a placement conversation instead, the first mission of the first run has to serve double duty as an assessment, which changes its design.

**Will a Telugu speaker be at the keyboard?** Still unanswered from research §7, and the assent gate makes it sharper than before: assent requires the player's utterance to align with a Telugu phrase at 0.40, live, on stage, through a browser mic. If no Telugu speaker is presenting, the demo must run the typed path — which fires the same gate at parity and is still honest — and the presenter should say so out loud rather than have a judge notice.

**Is `assentThreshold: 0.40` right?** It is `speech-score.ts:54`'s yellow band, chosen because a false negative ("I said it and nothing happened") is far more damaging than a false positive here. It has never been measured against real learner Telugu through Saaras. This is the single number in the document most likely to be wrong, and it gates every mission in the game. Measure it on ten recorded learner utterances before trusting any of the scoring numbers in section 5.

**Nineteen Telugu strings need a native speaker's eyes.** Who, and by when? The refusals matter most.
