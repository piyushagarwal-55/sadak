<p align="center">
  <img src="game_engine/app/icon.png" alt="SADAK" width="44" height="44" />
</p>

<h1 align="center">SADAK</h1>

<p align="center">
  <b>सड़क</b> — a 3D Indian street you walk through and talk your way across,<br/>
  in ten Indian languages, out loud.<br/>
  Describe a situation in one line of English and the street for it gets built.
</p>

<p align="center">
  <b><a href="https://main.d33zh3b90nj4kw.amplifyapp.com">main.d33zh3b90nj4kw.amplifyapp.com</a></b><br/>
  <sub>Opens as a guest. No account, no install, no card.</sub>
</p>

<p align="center">
  <sub>Built for <b>Bharat Builds</b> · Deployed on AWS Amplify + DynamoDB</sub>
</p>

---

## Contents

- [Try it in sixty seconds](#try-it-in-sixty-seconds)
- [The problem](#the-problem)
- [What we built](#what-we-built)
- [Why this is different](#why-this-is-different)
- [The rule the whole thing is built on](#the-rule-the-whole-thing-is-built-on)
- [Features](#features)
- [Who uses this, and why they come back](#who-uses-this-and-why-they-come-back)
- [AWS architecture](#aws-architecture)
- [How one turn works](#how-one-turn-works)
- [What deploying this actually taught us](#what-deploying-this-actually-taught-us)
- [Stack](#stack)
- [Measured](#measured)
- [Honest limitations](#honest-limitations)
- [Run it locally](#run-it-locally)
- [Scripts](#scripts)
- [Repository map](#repository-map)

---

## Try it in sixty seconds

No setup. This all runs on the deployed site.

1. Open **[main.d33zh3b90nj4kw.amplifyapp.com](https://main.d33zh3b90nj4kw.amplifyapp.com)** and press **Continue as guest**.
2. Pick **Hyderabad**. Then pick the language *you already read* — that is a
   separate choice and it matters.
3. Press **Just walk in**. You are on Charminar Lane, third person, on foot.
4. Walk up to the vegetable seller. Hold the microphone button and say anything.
   She answers in Telugu, out loud, and you get her line written three ways.
5. Go back out and instead type `I want to buy vegetables at the market`.
   A street gets built for that sentence — the stalls, the seller, her stock,
   her prices, and an errand.
6. Haggle with her. Watch the wallet in the corner when she comes down.

That last step is the one worth doing. The price she drops to is set by the
engine, not the model, and the money actually leaves your wallet.

---

## The problem

Someone takes a job in Hyderabad. They speak Hindi and English, they have a
degree, they are good at their work. On the first Saturday they walk to the
vegetable stall at the end of the road and cannot buy tomatoes.

Not because they lack vocabulary. Because the woman at the stall speaks first,
in a sentence they did not choose the topic of, at a speed nobody slowed down
for, with someone waiting behind them. By the time they have taken the sentence
apart, she is serving the next person.

This is the ordinary experience of moving between language regions in India.
People move constantly — for work, for college, for family — and the languages
change every few hundred kilometres. Ten of them are spoken by tens of millions
of people each. The move happens long before the language does.

**What existing tools give you is not what that moment needs.**

A flashcard app shows you a card and asks for a word. You produce it, because
you were primed: the app told you what the topic was, gave you one thing to do,
and waited as long as you liked. That trains *recall under priming*, and recall
under priming is not the skill that fails at the stall.

A chatbot waits for you to start. You open the app, you decide what to say, you
type it, you take your time, and it replies politely to whatever you produce. It
will never misunderstand you on purpose, never be busy, never be out of
tomatoes, and never charge you a tourist price. It is a patient tutor, and the
street is not patient.

A class teaches you the grammar of a language you will use in a market. That is
a real foundation and it is also not the same skill.

**The gap is specific: producing the right sentence, to the right person, at a
moment you did not choose, when something is at stake.** Nothing in the usual
stack trains that, because training it needs a world that can go wrong.

---

## What we built

SADAK is a third-person street. You walk it. Everyone on it speaks the language
of that city and nothing else — no English fallback, no translate button, no
shopkeeper who switches to accommodate you. You walk into range, they open, and
the errand does not complete until you answer.

There are two ways in, and they answer different needs.

### Walk in

Pick a city and start. The street is already built and the errands are already
written — buy a kilo of tomatoes, find the bangle shop, get a ticket. This is
for general practice in a language, when you want repetition rather than a
specific rehearsal.

### Describe it

Type what you are actually about to do, in plain English, in one line:

```
I want to buy vegetables at the market
I need a ticket at the railway station
getting a haircut before the wedding
```

A world is generated from that sentence. Not a level pulled off a shelf — the
compiler works out what that place contains: who is selling, what they stock,
what they charge, who else is standing around, and what you have to come away
with. Then you walk into it and do the thing you are going to have to do
tomorrow.

This is the feature the product exists for. Everything else supports it.

### Ten cities, ten languages

| City | Street | Language |
|---|---|---|
| Old Delhi | Purani Sadak | Hindi — हिन्दी |
| Hyderabad | Charminar Lane | Telugu — తెలుగు |
| Chennai | Marina Nagar | Tamil — தமிழ் |
| Mumbai | Dadar Chowk | Marathi — मराठी |
| Kolkata | Park Gully | Bengali — বাংলা |
| Bengaluru | Majestic Cross | Kannada — ಕನ್ನಡ |
| Kochi | Fort Kochi | Malayalam — മലയാളം |
| Ahmedabad | Manek Chowk | Gujarati — ગુજરાતી |
| Amritsar | Hall Bazaar | Punjabi — ਪੰਜਾਬੀ |
| Bhubaneswar | Lingaraj Lane | Odia — ଓଡ଼ିଆ |

---

## Why this is different

### It does not assume you speak English

There are two language pickers, not one. The first is the city — the language
you are learning. The second is **the language you already read**, and every
hint, every meaning, every correction comes back in that one.

So a Tamil speaker learning Hindi reads the meanings in Tamil. A Telugu speaker
learning Marathi reads them in Telugu. English never has to be in the room.

Almost every language product on the market quietly assumes English is the floor
you start from. For most of the people who need this, it is not. Someone moving
from a Telugu-speaking town to Mumbai for work needs Marathi, and routing that
through English adds a second language they do not have to a problem they
already have.

This is one dropdown and it changes who can use the product at all.

### The world can refuse you

A chatbot is always pleased to hear from you. It accepts a wrong sentence,
responds warmly, and moves on. Nothing is at stake, so nothing sticks.

The street can say no. She can be **sold out**. She can have a **floor price she
will not go under**. She can **mishear you**. She can be **busy**. She can quote
you a **tourist price** because you sound like you are from out of town. She can
**only sell by the kilo** when you asked for half. She can **offer you something
else** when she does not have what you came for.

Those are the eight obstacles in the deck, and they are picked per run. Being
wrong costs you the errand, and that is the whole point — you get to be bad at
this somewhere it does not matter.

### You have to start the conversation

In a chat app, you press a button and the conversation begins on your schedule.
On the street there are several people, you have to decide who to approach, you
walk into range, and she speaks first. You can also walk away.

That makes the moment one you chose and can lose, rather than one the software
scheduled for you. It is the closest thing software can get to the actual
failure condition.

### The model cannot lie about the world

This is covered properly in the next section, but as a difference: when the
seller says a price, that number came from the engine. She cannot invent a
discount to be agreeable, cannot sell you something she does not have, and
cannot decide your errand is complete when it is not.

That is what separates a simulation from a language model in a costume, and you
can see it on screen — the wallet changes.

### It is a place, not a list

You remember where the vegetable stall was. Spatial memory is doing work that a
scrolling list of phrases cannot do, and walking past the bangle shop on the way
to the vegetables is how you learn that the bangle shop exists.

---

## The rule the whole thing is built on

> **The model controls behaviour. It never controls reality.**

Every design decision in the simulation layer comes from this one line.

The language model decides how a character *talks* — the words, the tone,
whether she is warm or impatient, how she phrases a refusal. It never decides
what is *true*: prices, stock, what the player actually said, whether money
moved, whether an errand advanced.

Those are the engine's, and the engine is pure functions over
`(scenario, state)`. The same run scored twice gives the same number. A model
that has a bad day produces a worse sentence, never a broken world.

Concretely:

- **Prices** come from a ladder the scenario owns: `[opening, mid, floor]`. The
  model is handed the number it may say and cannot generate one.
- **Stock** is a fact in world state. If she has no tomatoes, no sentence the
  model writes can sell you tomatoes.
- **What the player did** is a separate model call with a locked schema that can
  only return one of a closed set of values, and the engine acts on that value —
  not on the prose.
- **Conversation state** moves through a phase machine with a declared edge
  table ([`lib/sim/exchange.ts`](game_engine/lib/sim/exchange.ts)), so a
  conversation cannot skip from hello to sold.
- **Scoring** is arithmetic. No model is consulted
  ([`lib/sim/score.ts`](game_engine/lib/sim/score.ts)).

Where this came from: earlier versions asked the model to both speak and report.
It would narrate a sale that did not happen, or quote ₹70 when the engine had
set ₹40, and the wallet and the subtitle would disagree on screen. Splitting the
job fixed a whole class of bug at once.

---

## Features

### Speech in, speech out, in ten languages

Hold the button and talk. Speech recognition is tuned for code-switched Indian
speech — the way people actually talk, half a sentence in Telugu and a number in
English — and replies are spoken back in the same language.

Every line you hear is also written three ways:

```
రండి రండి! టమాటా తాజాగా ఉంది.          ← what she said
Randi randi! Tamaataa taajaagaa undi.  ← how to say it
Come, come! The tomatoes are fresh.    ← what it means
```

The third line is in *your* language, not necessarily English.

If speech fails — a bad mic, a noisy room, a browser that will not cooperate —
there is a keyboard toggle on the same card. The turn still counts.

### Worlds generated from one sentence

The compiler takes plain English and produces a full scenario: the place, the
cast, what each character sells and knows, the goods with prices and stock, the
errands, and the 3D street assembled from a kit of parts.

Generated worlds are kept server-side and handed to the browser as an id. This
is a security decision, not a convenience one: a client that can post its own
scenario can post one where the tomato floor is ₹1, and the vetting layer would
enforce it perfectly, because it enforces the scenario it is handed.

### Errands that can actually fail

An errand is a closed action — `buy` or `ask` — because a family of tasks is
only real if something can prove it happened. You either came away with a kilo
of tomatoes or you did not. The wallet either changed or it did not.

### An obstacle deck

Eight obstacles, drawn per run:

| Obstacle | What it does to you |
|---|---|
| `must_greet` | She will not talk business until you greet her properly |
| `mishears` | She gets your quantity or your item wrong, and you have to correct her |
| `tourist_price` | She opens high because you sound like you are from elsewhere |
| `kilo_only` | You asked for half a kilo; she sells by the kilo |
| `sold_out` | She does not have what you came for |
| `offers_other` | She has something else and would like you to take it |
| `busy` | She is serving someone else and you have to wait or push in |
| `fast_talker` | She talks the way people actually talk, not the way lessons do |

These are the conversational moves that break people in real markets. They are
also the moves that never appear in a language app, because an app has no reason
to be difficult.

### Eleven language functions, tracked

The engine records what you actually *produced*, not what you were shown:

`greet` · `ask_price` · `negotiate` · `clarify` · `refuse` · `ask_location` ·
`specify_quantity` · `compare` · `accept_substitute` · `thank` · `answer`

That last one exists because of a bug worth describing. The shopkeeper started
asking questions back — *"are you from here, or somewhere else?"* — and the card
underneath still said *"Auntie, how much are the tomatoes?"*, because every move
the coach could make was a move about shopping. The player had been asked
something and the software could only think about the errand. `answer` is the
function that lets a learner do the most ordinary thing in a conversation: say
something back about themselves.

### Difficulty that adapts to you

Three bands — beginner, intermediate, advanced — which change how many errands
you get, how much money you start with, how many obstacles are in play and how
forgiving the scoring is.

On top of that, obstacle selection reads your history and picks the ones that
drill the functions you have produced *least*. If you have never once negotiated,
you will meet a seller who wants to be haggled with. That is the difference
between practice and repetition.

### A learner profile that persists

Counts per language function, per language, summed across every run, plus how
many runs, how many turns, and the best sentence you have ever produced.

The debrief at the end of a run uses it to say what *changed* — what you did for
the first time today, what you have still never tried — rather than only what
the run scored. A score tells you how a run went. This tells you what you can do
now that you could not before, which is the question someone learning a language
is actually asking.

### A coach card that knows what just happened

Under every reply is one line you could say back. Not a phrasebook entry — it is
generated against the current state of the conversation, so it answers *her
actual sentence*, and it is written in your reading language as well as hers.

### Scoring you can check

Per turn and per run, and both are pure arithmetic over the world state. Nothing
is asked of a model, nothing is stored mid-calculation, and the same run scored
twice gives the same number. You can read
[`score.ts`](game_engine/lib/sim/score.ts) and know exactly why you got what you
got.

### A leaderboard, and no sign-up wall

Anonymous sign-in mints a real session with a real user id, so row-level
security, progress and the leaderboard all work for a guest exactly as they do
for a signed-in player. Someone who decides to keep their progress can attach an
email later and the id does not change.

---

## Who uses this, and why they come back

**Someone who has just moved, or is about to.** The describe-a-situation feature
is built for the night before. You know you have to go to the market tomorrow, so
you rehearse the market tonight — with a seller who mishears you and a price that
does not drop unless you push.

**Someone who studied the language and still cannot use it.** This is a large
group and a frustrated one. They have vocabulary and grammar and no production
under pressure. SADAK is close to useless for teaching a first hundred words and
useful for the gap between knowing words and saying them.

**Someone whose reading language is not English.** Covered above, and it is the
part most likely to matter at scale. A product that requires English to teach
Marathi excludes most of the people who need Marathi.

**Someone who needs a specific errand, once.** A hospital visit, a police
station, a landlord conversation. The world is built from a sentence, so the
long tail is reachable in a way an authored curriculum never is.

### The impact claim, stated carefully

We are not claiming this replaces a language course, and it does not teach a
language from zero. What it does is close a specific gap: the distance between
knowing a sentence and producing it, to a stranger, first, under time pressure,
when being wrong costs something.

That gap is where confidence is lost. People stop trying after a few bad
encounters at a counter, and then stop learning. A place to be bad at it first,
that costs nothing and where nobody is waiting, is a narrow intervention with a
specific effect.

---

## AWS architecture

| Service | What it does here | State |
|---|---|---|
| **Amplify Hosting** | Serves the Next.js 15 app as real SSR on `WEB_COMPUTE` — 18 server routes plus auth middleware, not a static export. CI/CD on push to `main`. | Live, us-east-1 |
| **DynamoDB** | Compiled worlds and learner profiles. `PAY_PER_REQUEST`, TTL on the scenario table. | Live, ap-south-1 |
| **IAM** | Two roles separated by job: a build role, and an SSR compute role scoped to exactly two table ARNs. No AWS keys in environment variables. | Live |
| **Bedrock** | Second reasoning plane behind a provider seam. Written, committed, one environment variable from running. | Built, gated — see [Honest limitations](#honest-limitations) |

### Why the regions are split

The app runs in **us-east-1** and the tables are in **ap-south-1**, and that is
deliberate rather than an accident of setup. This AWS account cannot create
Amplify apps in ap-south-1 at all — it reports "maximum number of apps" with one
app against a quota of twenty-five. The tables stayed in Mumbai because that is
nearer the users.

Which creates a trap we walked into before it could bite:
`tableRegion()` in [`lib/sim/aws/dynamo.ts`](game_engine/lib/sim/aws/dynamo.ts)
is pinned, not read from `AWS_REGION`. On Lambda that variable is set
automatically to the *function's* region, so reading it would have pointed the
client at Virginia and reported `ResourceNotFoundException` for tables that
plainly exist.

### Why DynamoDB is there at all

Not as a checkbox. It fixes a specific failure.

A generated world is not in the authored registry, so the turn route cannot look
it up by id, and letting the browser post the whole scenario would hand a client
the ability to define its own prices. So the server keeps it — in memory first,
then on disk, then in DynamoDB.

The third tier is the one that matters in production. `os.tmpdir()` on a
serverless host belongs to one instance and dies with it. Two requests landing
on two instances is enough to lose a world, and it surfaces to a player as every
turn 404ing with *"Unknown character"* — which reads like a broken microphone,
not a missing cache entry. It would have been worse in production than in
development, because there is no server restart to blame it on.

The order matters: memory, disk, then network. A warm instance touches nothing
but a `Map`, so the network is only ever reached on a genuine miss — which is
exactly the case where the alternative is not a slower answer but no answer.

`npm run aws:cache` proves it by deleting both tiers in front of DynamoDB for
real, not by mocking the miss:

```
PASS  readable straight away (memory)
PASS  memory cleared and the file deleted
PASS  came back from DynamoDB in 69ms
PASS  and it is the same world
PASS  with its 3 missions intact
PASS  and it is back in memory, so the next turn is free
PASS  an unknown id is still null
```

### Why there are no AWS keys in the environment

Amplify's SSR compute carries an IAM role and the SDK finds it through the
default credential chain. `configured()` in
[`dynamo.ts`](game_engine/lib/sim/aws/dynamo.ts) recognises a role as readily as
static keys, so the same code runs on a laptop with a `.env` and on Lambda with
neither.

That function had a bug worth recording, because it would only ever have
appeared in production: it originally asked *only* whether static keys existed.
True locally, false on Amplify — so it would have switched DynamoDB off in
precisely the place the third tier is load-bearing, silently, because
`archive()` and `restore()` swallow errors by design.

The compute role is scoped to two table ARNs and five actions. It cannot create
tables, cannot read anything else in the account, and there is no key for anyone
to rotate later.

---

## How one turn works

Three model calls, two of them in parallel:

```
                ┌─ READ     temp 0, JSON-schema locked
   what you ────┤           what did the player DO?  (closed enum)
   said         │
                └─ SPEAK    temp 0.8
                            what does she SAY?
                                   │
                                   ▼
                            SUGGEST    temp 0.7, schema locked
                            what could you say back?
```

**READ** runs at temperature 0 with a strict JSON schema, because the whole value
of the call is that its answer has a known shape. It reports what it heard —
`greet`, `ask`, `haggle`, `accept`, `refuse`, `unclear` — separately from what
anybody does about it. Measured at 165–340ms.

**SPEAK** runs at 0.8 because its output is a sentence and sentences should not
be deterministic. It is handed a rendered brief of the world rather than tools,
because tool calling measured about 2.5 seconds against 400ms for a plain turn,
and on a live microphone the round trip is the whole experience.

**SUGGEST** writes the card underneath, after the other two have landed, so it
can answer what she actually said.

Between them sits the engine. It takes the closed enum from READ, checks it
against world state and the phase machine, decides what is allowed, and applies
it. The prose from SPEAK is displayed; it is never parsed for meaning.

Structure of the code:

- [`lib/sim/read.ts`](game_engine/lib/sim/read.ts) — the listening call
- [`lib/sim/turn/context.ts`](game_engine/lib/sim/turn/context.ts) — builds every prompt fragment in one place
- [`lib/sim/turn/orchestrator.ts`](game_engine/lib/sim/turn/orchestrator.ts) — owns world state; the only thing that mutates it
- [`lib/sim/exchange.ts`](game_engine/lib/sim/exchange.ts) — phase machine with a declared edge table
- [`app/api/sim/turn/route.ts`](game_engine/app/api/sim/turn/route.ts) — 125 lines, parse and hand over, no business logic

That route used to be 733 lines with every `state = ...` in the codebase inside
it. Two of the worst bugs this project shipped were "a prompt fragment was never
assembled", which is a class of bug that only exists when assembly is spread
across a function rather than owned by an object.

---

## What deploying this actually taught us

Both of these cost hours and are written up with evidence in
[`docs/DEPLOY.md`](docs/DEPLOY.md).

### Amplify environment variables reach the build, not the SSR runtime

`NEXT_PUBLIC_*` works, because Next inlines those at build time. Anything read
with `process.env` inside a route handler is undefined at request time.

It showed up as the app's own error — `SARVAM_API_KEY is not set. Copy
.env.example to .env and add your key.` — on a deployment where that variable was
plainly set in the console, 36 characters, no branch override.

The build now writes the server-side variables into `.env.production` before
`next build`, through an allow-list grep rather than a bare `env`: the build
container also holds AWS credentials and CodeBuild metadata, and none of that
belongs in a bundle.

### "Unable to assume specified IAM Role" usually means Amplify cannot reach your repo

Eight builds died on that message in under a minute each. We created a service
role, corrected the trust policy, added regional service principals, moved
regions, and finally ran a build with no roles attached at all. Same error every
time, because the roles were never involved.

The fix was connecting the repository through the console's **GitHub App**
instead of a personal access token. It cloned on the first attempt. Amplify
reports an unreachable repository as an IAM failure, and the error names a thing
that is not the problem.

The test that would have saved most of that time — build with no roles attached
— took thirty seconds and should have been first.

### A monorepo needs `AMPLIFY_MONOREPO_APP_ROOT`, even with `appRoot` in amplify.yml

Framework detection runs *before* the build spec is read, so without the
environment variable Amplify looks for `package.json` at the repo root, does not
find it, and stops with `Cannot read 'next' version in package.json`.

---

## Stack

**Frontend and server**
Next.js 15 App Router · React 19 · TypeScript · Tailwind v4 · three.js
(the street is assembled from a kit of parts, not authored by hand)

**AWS**
Amplify Hosting — SSR, 18 server routes, CI/CD on push
DynamoDB — compiled worlds and learner profiles, `ap-south-1`
IAM — build role and SSR compute role, scoped to two table ARNs

**Reasoning**
Three calls per turn behind a provider seam
([`lib/sim/llm.ts`](game_engine/lib/sim/llm.ts)). AWS Bedrock is wired as the
second plane and switches on with one environment variable.

**Speech**
Speech in and speech out across all ten Indian languages, with an audio cache so
a line is generated once and served from storage after that.

**Auth and data**
Anonymous and email sign-in, Postgres with row-level security, object storage
for the audio cache.

**Live voice**
`agent.py`, a separate Python worker with its own deployment.

Named providers and model ids for reasoning, speech and auth are in
[`.env.example`](game_engine/.env.example) and under
[`game_engine/lib/sim/`](game_engine/lib/sim). The organisers confirmed any AI
tooling is permitted and that the requirement is deployment on AWS.

**Scale**
377 tracked files · 18 API routes · 99 files in the simulation layer ·
12 database migrations · 280+ assertions in the offline smoke suite

---

## Measured

Numbers taken from the running deployment, not estimated.

| | |
|---|---|
| Page, warm | 0.36–0.45s |
| Page, cold start | ~3.9s |
| DynamoDB world restore | 69–346ms, us-east-1 to ap-south-1 |
| Reasoning call, Telugu | ~450ms |
| READ call (schema-locked) | 165–340ms |
| Turn with Bedrock gated, falling back | 1516ms end to end |
| Amplify build to live | ~2.5 min |
| Offline smoke suite | 280+ assertions, no network |
| Cost to date | ₹0 — free tier, `PAY_PER_REQUEST` with TTL |

---

## Honest limitations

These are here because a reader who finds a gap themselves discounts everything
else in the document.

### Bedrock is built but not running

The client, the provider seam and a one-way fallback are written and committed
([`bedrock.ts`](game_engine/lib/sim/bedrock.ts),
[`llm.ts`](game_engine/lib/sim/llm.ts)), and `SIM_LLM_PROVIDER=bedrock` switches
to it.

It is not switched on because this AWS account's Bedrock invocation quotas are
applied at **0** against AWS defaults of two to twenty million tokens per minute,
so every call returns `400 Operation not allowed` in every region, for every
provider including Amazon's own Nova. Quota increases are filed. The full
diagnosis — including three wrong answers before the right one — is in
[`docs/AWS.md`](docs/AWS.md).

The seam was designed for exactly this. Verified with Bedrock gated: the call
fails, logs why, falls through to the current provider, and the player still
gets their turn in 1516ms.

### Speech does not run on Polly

Polly's Indian coverage is `en-IN` — Aditi, Raveena, Kajal. There is no Tamil,
Telugu, Kannada, Malayalam, Marathi, Gujarati, Bengali, Punjabi or Odia voice.
Moving speech to AWS would have cost nine of the ten languages.

So it is a deliberate hybrid, and worth saying out loud rather than hiding: AWS
for hosting, state and delivery, and a provider with full Indic coverage for
the voices AWS does not have. That is a better answer than a migration which
quietly drops nine languages to claim a clean sweep.

### Two of the ten languages are weaker

The 27B holds Telugu and Hindi cleanly and gets clumsy in Punjabi and Odia. Asked
in Marathi for a forty-rupee tomato it once answered `टोमॅटो किलो किलो सत्तर
रुपये` — a stutter, and seventy when the engine had said forty.

`npm run sim:provider` sends one identical market turn through both providers in
those languages so the comparison is measured rather than asserted. Nothing in
that script scores a sentence, because a script that graded Punjabi would need to
be better at Punjabi than the models it is grading.

### About 200 engine phrases are not native-verified

The non-Telugu engine lines, market phrases and goods names are hand-written and
have not been checked by native speakers. They are correct enough to play and
not yet good enough to ship to learners without review.

### The group-conversation path is incomplete

More than one character can be in a scene, but there is no UI yet for who is
speaking and no group-specific scoring.

---

## Run it locally

```bash
git clone https://github.com/piyushagarwal-55/sadak
cd sadak/game_engine
cp .env.example .env
npm ci
npm run dev
```

`.env.example` lists every variable the app reads, with a note on each. Fill in
the reasoning, speech and database keys; the rest have defaults.

**AWS is optional locally.** `configured()` returns false without credentials,
the DynamoDB tier disables itself, and the app runs on memory and disk exactly as
it did before that tier existed. Adding AWS cannot regress a machine that does
not use it.

For live voice you also need the voice worker:

```bash
python agent.py dev
```

Without it, conversations fall back to the push-to-talk REST path on their own.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | The game on `localhost:3000` |
| `npm run sim:smoke` | 280+ assertions across the engine. No network, no keys. |
| `npm run sim:turn` | Walks a scripted conversation against the live turn route |
| `npm run sim:compile` | Compiles a world from a sentence and prints it |
| `npm run sim:provider` | The same market turn through both reasoning providers, side by side |
| `npm run aws:setup` | Creates the DynamoDB tables. Idempotent. |
| `npm run aws:cache` | Proves a world survives losing memory and disk |

`sim:smoke` is the one to run first. It needs nothing and proves the engine.

---

## Repository map

```
game_engine/                  the Next.js app
  app/
    api/sim/compile/          build a world from a sentence
    api/sim/turn/             one turn — 111 lines, no business logic
    api/sim/speak/            speak a character line
    api/stt/                  speech to text
    page.tsx                  landing for strangers, city picker for players
  components/
    landing/                  the public landing page
    play/                     the play screen, talk panel, debrief
  lib/sim/
    schema.ts                 world state, facts, missions, language functions
    exchange.ts               phase machine with a declared edge table
    read.ts                   the listening call, schema-locked
    turn/context.ts           every prompt fragment, built in one place
    turn/orchestrator.ts      owns world state
    turn/suggest.ts           the card underneath
    actions.ts                what the engine allows, and what it refuses
    obstacles.ts              the eight obstacles
    difficulty.ts  tune.ts    three bands, and bending a scenario to one
    score.ts  turnscore.ts    arithmetic, no model
    learner.ts                what you can do, kept between runs
    aws/dynamo.ts             DynamoDB client, optional everywhere
    bedrock.ts  llm.ts        the second reasoning plane, and the seam
    compile/                  sentence to world
  lib/game/                   the street: buildings, props, materials, audio
  supabase/migrations/        12 migrations
agent.py                      live-voice worker, deployed separately
amplify.yml                   build spec, monorepo form
docs/AWS.md                   AWS setup, and what bit us
docs/DEPLOY.md                how this is deployed, and the faults above
docs/DEMO-SCRIPT.md           the demo video, beat by beat
```

---

<p align="center">
  <b><a href="https://main.d33zh3b90nj4kw.amplifyapp.com">Walk in →</a></b><br/>
  <sub>Opens as a guest. Go and fail at buying tomatoes.</sub>
</p>
