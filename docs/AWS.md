# AWS setup

Everything SADAK needs from AWS, and what was actually true when it was wired
against a real account on 19 Sep 2026 — which differed from the documentation
in three places worth writing down.

Nothing here asks you to paste a secret anywhere except your own
`game_engine/.env`, which `.gitignore` already covers with `.env*`.

## What each service is for

| Service | What it does here | Status |
|---|---|---|
| **Bedrock** | the three model calls in a turn — one reads what the player said, one writes the shopkeeper's reply, one writes the card | **wired**, `lib/sim/bedrock.ts` |
| **Transcribe** | speech in | not wired. All ten languages, batch and streaming, verified against the docs |
| **Polly** | speech out, Hindi and English only | not wired, and mostly will not be — see the bottom |
| **DynamoDB** | the learner profile, and the compiled-world cache | not wired. Both are `localStorage` and `os.tmpdir()` today, which is why "This world has expired" happens after a restart |
| **S3 + CloudFront** | the 3D kit, the Indic fonts, the district covers | not wired. Static and heavy; no business being served by Next |

## Bedrock: what to do

**One step, not three.** Console → **Bedrock** → *API keys* → *Generate
long-term API key*. Put it in `game_engine/.env` as
`AWS_BEARER_TOKEN_BEDROCK`. That is the whole setup.

Three things the general AWS documentation led us to expect, none of which held:

**There was no model access to request.** `ListFoundationModels` came back with
84 text models and `enableAccessToAllModelsByDefault: true`. The *Model access*
page is a step this account did not need.

**There is no IAM user to create.** A Bedrock API key is a bearer token — the
same `Authorization: Bearer` header the Groq client already uses. No SigV4, no
credential chain, and therefore no `@aws-sdk/*` package in `package.json` for
what is ultimately one POST. The scoped IAM policy below is still here, because
Transcribe, Polly and DynamoDB *will* need it; Bedrock does not.

**The region is us-east-1, not Mumbai.** `ap-south-1` has no `apac.` inference
profile for the Claude models — it answers *"The provided model identifier is
invalid"*. So the Indian region is not an option for this part, whatever the
latency argument says.

And one thing about model ids: every Anthropic model on Bedrock is
**INFERENCE_PROFILE only**. The id must be `us.anthropic.claude-…`, not
`anthropic.claude-…`. The bare id is a 400, not a 404, so it does not announce
itself as the wrong kind of name.

### What "Operation not allowed" actually was

**An account-level activation hold on Bedrock.** Not a quota, not the use-case
form, not new-account verification alone — one hold, which each of those three
is a different view of.

The test that settled it was going wider rather than deeper. Same key, same
call, six regions:

| Region | Response |
|---|---|
| us-east-1, us-east-2, us-west-2, ap-south-1 | `400 Operation not allowed` |
| eu-west-1, ap-southeast-1 | *"Your account is currently being verified."* |

Nothing differs but the wording. It spans Anthropic, Amazon Nova and DeepSeek,
and `us.` / `apac.` / `eu.` / `global.` profiles alike. `ListFoundationModels`
succeeds in every one of them, and DynamoDB on the same account is fine.

**Changing region does not help**, and the zero quotas below are the hold being
expressed rather than a separate cause — so raising them may not release it.
The fix is a support case asking for the hold on the account to be lifted.

One note if you test Mumbai: `ap-south-1` has no `us.` profiles, so a `us.`
model id there returns "The provided model identifier is invalid" — which looks
like a refusal and is not one. Use the `apac.` or `global.` ids that region
actually lists before concluding anything.

### The third wrong answer: the zero quota

True, and still not the cause.

**Every Claude model on this account had an applied quota of 0.**

Service Quotas → Bedrock → search "claude". Applied account-level quota value
`0`, against AWS defaults of 2,000,000 to 20,000,000 tokens per minute. Zero
tokens per minute is not a throttle, it is a closed door, and it is why every
invoke failed while `ListFoundationModels` succeeded: listing is not quota'd.

Adjustability is "Account level", so it is requestable directly from that page
— select the row, *Request increase at account level*, ask for the default.
For a `us.`-prefixed model id the rows that matter are the **cross-region**
ones, not `[bedrock-mantle endpoint]` and not batch.

Worth noticing, and I did not: the *batch* inference quotas on the same models
were all normal. An account whose batch quotas are default and whose invocation
quotas are uniformly zero has not been throttled by usage — it has never been
switched on. That asymmetry was visible in the first screenshot of the quota
page and would have pointed at a hold a day earlier.

The wrong answers below are kept, newest first, because the route to the right
one runs through them and a document that only shows the destination teaches
nobody the road.

### The second wrong answer: the use-case form

Real, and a genuine gate, but not the one that was biting.

**Anthropic models on Bedrock require a one-time use-case form** — "Anthropic
requires first-time customers to submit use case details before invoking a
model, once per account." It is in the console at Bedrock → Playground, and it
appears only when you try to use a model there. Nothing in the API surfaces it:
`ListFoundationModels` returns all 84 models with
`enableAccessToAllModelsByDefault: true` whether or not the form is done, which
is exactly why this was so hard to see from code.

On this account the form **could not be submitted either** — "Your account is
not authorized to perform this action. Please create a support case." And
DeepSeek V3.2 in the same playground returns the same `ValidationException:
Operation not allowed`, so whatever it is, it is not specific to Anthropic.

It is also not the account as a whole: **DynamoDB works from the same account
with a different key.** The restriction is Bedrock-only.

So there are two gates stacked, and the console is the only place either of
them is visible:

1. a per-account Anthropic use-case form, and
2. something above it that blocks submitting the form and blocks other
   providers too, which only AWS support can lift.

**The console playground is the diagnostic.** One prompt there distinguishes an
account restriction from a key problem in thirty seconds, and no amount of
probing the API from here would have found the form.

But the playground only narrowed it — it said "the account, not your key",
which was true and still not actionable. **Service Quotas is where an account
says what it is actually allowed to do**, and it should have been the second
place to look rather than the fourth.

### The first wrong answer: new-account verification

A brand-new AWS account is held back from `bedrock-runtime` while it is
verified. The control plane answers `200` throughout — listing models, getting
a model — so the key is plainly valid and the fault looks like yours.

It reports itself differently by region. Same key, same minute, same model:

| Region | | Message |
|---|---|---|
| us-east-2 | `403` | *Your account is currently being verified.* |
| us-east-1 | `400` | *Operation not allowed* |
| us-west-2 | `400` | *Operation not allowed* (once, `429` *Too many tokens per day*) |

The verification message was real — a new account genuinely is held back for a
while — but it was **not** the whole story, and treating it as the whole story
cost a day of waiting for something that was never going to clear on its own.
Twenty-four hours later every region said "Operation not allowed" and nothing
had changed, because the actual blocker was the use-case form above.

What holds regardless: **if Bedrock returns "Operation not allowed" on every
model including Amazon's own Nova, it is not your request.** `isAccountPending`
in `lib/sim/bedrock.ts` recognises all three faces of it, and the name is now
slightly wrong — it detects "Bedrock is refusing this account", whatever the
reason, which is the only distinction the fallback needs to make.

The lesson worth keeping is the order of operations, not the error table: **when
the API is opaque and the console is available, open the console.**

## The other three services

Console → **IAM** → *Users* → create one, no console access, then attach this
inline policy. Bedrock is deliberately absent: the API key covers it.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SpeechIn",
      "Effect": "Allow",
      "Action": ["transcribe:StartStreamTranscription", "transcribe:StartTranscriptionJob", "transcribe:GetTranscriptionJob"],
      "Resource": "*"
    },
    {
      "Sid": "SpeechOut",
      "Effect": "Allow",
      "Action": ["polly:SynthesizeSpeech", "polly:DescribeVoices"],
      "Resource": "*"
    },
    {
      "Sid": "MakeAndReadTheTables",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DescribeTable",
        "dynamodb:UpdateTimeToLive",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:DeleteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/sadak-learner",
        "arn:aws:dynamodb:*:*:table/sadak-scenarios"
      ]
    },
    {
      "Sid": "ListingCannotBeScoped",
      "Effect": "Allow",
      "Action": "dynamodb:ListTables",
      "Resource": "*"
    }
  ]
}
```

`CreateTable` is in there on purpose and scoped to the two names: the tables get
made by the app on first run rather than by hand in the console, so the schema
lives in the repo instead of in somebody's memory of which button they pressed.
It cannot create a table called anything else.

`UpdateTimeToLive` was missing from the first version of this policy and the
setup script reported it honestly rather than carrying on:

```
ttl could not be enabled: User: …/sadak-app is not authorized to perform:
dynamodb:UpdateTimeToLive
```

If your policy predates that line, add it and re-run `npm run aws:setup`.
Without it nothing breaks — `restore()` checks `expiresAt` itself, on purpose,
so correctness never depended on TTL — but old worlds stay in the table
forever instead of deleting themselves, which is a bill rather than a bug.

### Creating the tables

```bash
npm run aws:setup
```

Idempotent. Creates what is missing, leaves what exists, says which is which.

```bash
npm run aws:cache
```

Proves the thing the third tier exists for: remember a world, then delete BOTH
tiers in front of DynamoDB — the in-memory Map and the file on disk — and ask
for it back. That is what a second serverless instance sees. Measured from
Mumbai: **346ms**, and only ever on a genuine miss.

## How the switch works

`lib/sim/llm.ts` is the only file that knows there are two providers.
`SIM_LLM_PROVIDER` chooses which one *leads*, not which one exists — both stay
wired permanently, because a demo runs once, in front of people, on somebody
else's wifi.

The fallback is one-way: Bedrock falls back to Groq, never the reverse. Groq is
the measured path with eleven languages of evidence behind it; falling back
*towards* the better-understood thing is the only direction that reduces risk.

Verified end to end with Bedrock gated: the call fails, logs *"this AWS account
is still being verified"*, falls through to Groq, and the player gets their
turn in 1516ms. A stage failure costs a warning line and nothing else.

## Measuring it, rather than assuming

```bash
npm run sim:provider
```

Sends one identical market turn to both providers in Punjabi, Odia and Marathi
— the three languages `groq.ts` documents the 27B as clumsy in, and the entire
justification for this pivot. `-- all` adds Telugu as a control, which is the
one that would catch a regression being sold as a win.

Nothing in it scores a sentence. A script that graded Punjabi would have to be
better at Punjabi than the models it is grading, and if we had that we would not
need either of them. Read the output yourself.

Groq's baseline on the weak three, for comparison when Bedrock unlocks:

```
Punjabi   445ms  ਭਾਈ ਜੀ, ਟਮਾਟਰ ਇੱਕ ਕਿਲੋ ਵਿੱਚ ਚਾਲੀ ਰੁਪਏ ਦੇ ਹਨ।
Odia      308ms  କିଲୋ ୪୦ ଟଙ୍କା, ଯେତେ ଚାହାଁନ୍ତି ନେଇଯାନ୍ତୁ।
Marathi   200ms  टोमॅटो किलो किलो सत्तर रुपये, तुम्हाला किती तौल हवे आहे?
```

The Marathi line is the case for this work in one sentence: *किलो किलो* is
stuttered, and *सत्तर* is seventy when the engine said forty. The price is
wrong in the spoken line. That is not a style complaint.

## What is NOT moving, and why

**Text to speech stays on Sarvam for nine of the ten languages.** Polly's Indian
coverage is Hindi (Aditi, Kajal) and English (Indian). There is no Tamil,
Telugu, Kannada, Malayalam, Marathi, Gujarati, Bengali, Punjabi or Odia. Moving
TTS wholesale to AWS would cost this product nine of the ten languages that make
it what it is.

So it is a hybrid, on purpose, and worth saying out loud rather than hiding: AWS
for the model, the speech recognition, the data and the delivery; Sarvam for the
voices AWS does not have. That is what using the right tool looks like, and it
is a better answer than a migration that quietly drops nine languages to claim a
clean sweep.
