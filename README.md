<p align="center">
  <img src="game_engine/app/icon.png" alt="SADAK" width="44" height="44" />
</p>

<h1 align="center">SADAK</h1>

<p align="center">
  A 3D Indian street you walk through and talk your way across, in ten Indian languages.<br/>
  Describe a situation in one line of English and the street for it gets built.
</p>

<p align="center">
  <b><a href="https://main.d33zh3b90nj4kw.amplifyapp.com">main.d33zh3b90nj4kw.amplifyapp.com</a></b><br/>
  <sub>Opens as a guest. No account, no install.</sub>
</p>

---

## Try it in sixty seconds

1. Open the link and press **Continue as guest**.
2. Pick **Hyderabad**, and pick the language you already read.
3. Press **Just walk in**, walk up to the vegetable seller.
4. Hold the microphone button and say anything. She answers in Telugu, out loud.
5. Go back and instead type `I want to buy vegetables at the market`. A street gets built for that sentence.

Everything above runs on the deployed site. Nothing needs to be installed and
no key needs to be supplied.

---

## What it is

Most language apps ask you to produce a word when you are already primed for it.
Real speech asks you to produce a sentence when you are not: someone spoke
first, you did not choose the topic, and there is a queue behind you. That is
where people who "know" a language freeze.

SADAK puts you on a street where every character speaks the language of their
city and nothing else. You walk up, they open, and the errand does not complete
until you answer. There is no English fallback inside the world.

Two ways in:

- **Walk in** — the street for that city, with errands already written.
- **Describe it** — type what you are actually about to do, in plain English,
  and the world is generated from that sentence: the stalls, who is selling,
  what they stock, what they charge, and what you have to come away with.

Ten cities, ten languages: Hindi, Telugu, Tamil, Marathi, Bengali, Kannada,
Malayalam, Gujarati, Punjabi, Odia.

---

## AWS architecture

| Service | What it does here | State |
|---|---|---|
| **Amplify Hosting** | Serves the Next.js 15 app as real SSR on `WEB_COMPUTE` — 18 server routes and auth middleware, not a static export. CI/CD on push to `main`. | Live, us-east-1 |
| **DynamoDB** | Holds compiled worlds and learner profiles. `PAY_PER_REQUEST`, TTL on the scenario table. | Live, ap-south-1 |
| **IAM** | Two roles, separated by job: a build role, and an SSR compute role scoped to exactly two table ARNs. No AWS keys in environment variables. | Live |
| **Bedrock** | Second reasoning plane behind a provider seam. Written, committed, one environment variable from running. | Built, not running — see [Honest limitations](#honest-limitations) |

Region split is deliberate and not an accident of setup. The app runs in
us-east-1 because this AWS account cannot create Amplify apps in ap-south-1 at
all; the tables stayed in Mumbai because that is nearer the users. `tableRegion()`
in [`lib/sim/aws/dynamo.ts`](game_engine/lib/sim/aws/dynamo.ts) is pinned rather
than reading `AWS_REGION`, because on Lambda that variable is set automatically
to the *function's* region and would have sent the client looking for Mumbai
tables in Virginia.

### The DynamoDB tier exists for a specific bug

A generated world is not in the authored registry, so the turn route cannot look
it up by id, and letting the browser post the whole scenario would let a client
send one where the tomato floor is ₹1. So the server keeps it: in memory first,
then on disk, then in DynamoDB.

The third tier is the one that matters in production. `os.tmpdir()` on a
serverless host belongs to one instance and dies with it, so two requests landing
on two instances is enough to lose a world — and it surfaces to a player as every
turn 404ing with "Unknown character", which reads like a broken microphone rather
than a missing cache entry.

`npm run aws:cache` proves it by deleting both tiers in front of DynamoDB for
real and asking for the world back:

```
PASS  readable straight away (memory)
PASS  memory cleared and the file deleted
PASS  came back from DynamoDB in 69ms
PASS  with its 3 missions intact
PASS  an unknown id is still null
```

### Two deployment faults worth knowing about

Both are written up in [`docs/DEPLOY.md`](docs/DEPLOY.md) with the evidence.

**Amplify environment variables reach the build, not the SSR runtime.**
`NEXT_PUBLIC_*` works because Next inlines it at build time; anything read with
`process.env` inside a route handler is undefined at request time. It showed up
as `SARVAM_API_KEY is not set` on a deployment where the variable was plainly
set in the console. The build now writes the server-side variables to
`.env.production` before `next build`, through an allow-list grep rather than a
bare `env` — the build container also holds AWS credentials and none of that
belongs in a bundle.

**`Unable to assume specified IAM Role` usually means Amplify cannot reach your
repository.** Eight builds died on that message. New roles, corrected trust
policies, regional service principals, two regions, and finally a run with no
roles attached at all — same error every time, because the roles were never
involved. Connecting the repo through the console's GitHub App instead of a
personal access token made it clone on the first attempt.

---

## How a turn actually works

The rule the whole codebase is built around: **the model controls behaviour, it
never controls reality.**

A turn is three model calls, two of them in parallel:

```
        ┌─ READ    temp 0, JSON-schema locked — what did the player DO?
player ─┤
        └─ SPEAK   temp 0.8 — what does she SAY?
                        │
                        └─ SUGGEST   temp 0.7 — what could you say back?
```

`READ` reports what it heard as a closed enum (`greet`, `ask`, `haggle`,
`accept`, `refuse`, `unclear`). The engine — not the model — then decides what
actually changes: whether she has stock, what she is allowed to charge, whether
the errand advances, what leaves the wallet.

So when she comes down from ₹40 to ₹35, that is a price ladder the engine owns.
The model is handed the number and cannot invent one, cannot sell what is not in
stock, and cannot complete an errand that did not happen. A phase machine with a
declared edge table ([`lib/sim/exchange.ts`](game_engine/lib/sim/exchange.ts))
keeps the conversation from skipping states.

This is the difference between a simulation and a chatbot in a costume, and it
is visible on screen: the wallet changes.

---

## Stack

- **Next.js 15** App Router, React 19, TypeScript, Tailwind v4
- **three.js** for the street — worlds assembled from a kit of parts, not authored by hand
- **Groq** (`qwen/qwen3.8-27b`) for the three reasoning calls
- **Sarvam AI** — `saaras:v3` speech in, `bulbul:v3` speech out, ten Indian languages
- **Supabase** — auth including anonymous sign-in, Postgres, TTS audio cache
- **LiveKit** — a separate Python voice agent (`agent.py`), deployed on its own

377 tracked files, 18 API routes, 99 files in the simulation layer, 12 database
migrations.

---

## Honest limitations

**Bedrock is built but not running.** The client, the provider seam and a
one-way fallback are written and committed
([`lib/sim/bedrock.ts`](game_engine/lib/sim/bedrock.ts),
[`lib/sim/llm.ts`](game_engine/lib/sim/llm.ts)), and `SIM_LLM_PROVIDER=bedrock`
switches to it. It is not switched on because this AWS account's Bedrock
invocation quotas are applied at **0** against defaults of two to twenty million
tokens per minute, so every call returns `400 Operation not allowed` in every
region. Quota increases are filed. The full diagnosis, including three wrong
answers before the right one, is in [`docs/AWS.md`](docs/AWS.md).

The seam was designed to survive exactly this. Verified with Bedrock gated: the
call fails, logs why, falls through to Groq, and the player still gets their turn
in 1516ms.

**Text-to-speech stays on Sarvam, not Polly.** Polly's Indian coverage is
`en-IN` — Aditi, Raveena, Kajal. There is no Tamil, Telugu, Kannada, Malayalam,
Marathi, Gujarati, Bengali, Punjabi or Odia voice. Moving speech to AWS would
have cost nine of the ten languages, so it is a deliberate hybrid: AWS for
hosting, state and reasoning; Sarvam for the voices AWS does not have.

**Two of the ten languages are weaker than the rest.** The 27B holds Telugu and
Hindi cleanly and gets clumsy in Punjabi and Odia. `npm run sim:provider` sends
one identical market turn through both providers in those languages so the
comparison is measured rather than asserted. Nothing in that script scores a
sentence, because a script that graded Punjabi would need to be better at
Punjabi than the models it grades.

**Roughly 200 non-Telugu engine phrases are hand-written and not
native-verified.**

---

## Measured

| | |
|---|---|
| Page, warm | 0.36–0.45s |
| Page, cold start | ~3.9s |
| DynamoDB world restore | 69–346ms from ap-south-1 |
| Groq turn, Telugu | ~450ms |
| Amplify build to live | ~2.5 min |
| Cost so far | ₹0 — free tier, `PAY_PER_REQUEST` with TTL |

---

## Run it locally

```bash
git clone https://github.com/piyushagarwal-55/sadak
cd sadak/game_engine
cp .env.example .env     # fill in GROQ_API_KEY, SARVAM_API_KEY, the Supabase pair
npm ci
npm run dev
```

AWS is optional locally. `configured()` returns false without credentials and
the DynamoDB tier disables itself, so the app runs on memory and disk exactly as
it did before that tier existed.

Useful scripts:

| Command | What it does |
|---|---|
| `npm run sim:turn` | Walks a scripted conversation against the live turn route |
| `npm run sim:smoke` | 280+ assertions across the engine, no network |
| `npm run sim:provider` | Same market turn through Groq and Bedrock, side by side |
| `npm run aws:setup` | Creates the DynamoDB tables. Idempotent. |
| `npm run aws:cache` | Proves a world survives losing memory and disk |

---

## Repository

```
game_engine/            the Next.js app
  app/api/sim/          compile a world · one turn · speak a line
  lib/sim/              the simulation: engine, phase machine, scoring
  lib/sim/turn/         context builder, orchestrator, the suggestion call
  lib/sim/aws/          DynamoDB client, optional everywhere
  lib/game/             the street: buildings, props, materials, audio
  components/landing/   the public landing page
agent.py                the LiveKit voice worker, deployed separately
docs/AWS.md             AWS setup, and what bit us
docs/DEPLOY.md          how this is deployed, and the two faults above
docs/DEMO-SCRIPT.md     the demo video, beat by beat
```

Built for **Bharat Builds**. The AWS account it runs on is restricted — Mumbai
blocked for Amplify, a one-app cap, Bedrock at zero. The architecture absorbed
all three because the fallbacks were written before they were needed.
