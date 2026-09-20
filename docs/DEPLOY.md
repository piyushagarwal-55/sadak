# Deploying SADAK on AWS

The hackathon's one hard requirement, in the organisers' words: *"the only
thing we ask is that you deploy on AWS."* Bedrock is explicitly optional and
any AI tooling is allowed, so the reasoning plane stays on Groq and this
document is the actual deliverable.

## What goes where

| Piece | Where | Why |
|---|---|---|
| The Next app (`game_engine/`) | **Amplify Hosting** | Next 15 App Router, twenty server routes and middleware — it needs real SSR, and Amplify runs that from a git push |
| Compiled worlds, learner profiles | **DynamoDB**, `ap-south-1` | already live |
| The LiveKit voice agent (`agent.py`) | **not here** | separate Python deployment, its own Dockerfile at the repo root. Untouched. |
| Speech in and out | **Sarvam** | Polly has `en-IN` voices only — Aditi, Raveena, Kajal — and no Tamil, Telugu, Kannada, Malayalam, Marathi, Gujarati, Bengali, Punjabi or Odia. Nine of ten languages is not a trade worth making. |

## 1. Create the Amplify app

Console → **Amplify** → *Create new app* → **GitHub** → authorise → pick
`mittal-parth/sadak` and the branch you are submitting.

Amplify reads `amplify.yml` at the repo root and finds `appRoot: game_engine`
by itself. If it offers to generate a build spec, decline — the one in the repo
is the one that knows the app is not at the root.

Deploy in **ap-south-1 (Mumbai)** if offered: it is nearest the users and the
same region as the tables.

## 2. Environment variables

Amplify → *Hosting* → **Environment variables**. Copy these from
`game_engine/.env`:

**Required — the build or the app fails without them**

```
GROQ_API_KEY
SARVAM_API_KEY
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SECRET_KEY
NEXT_PUBLIC_SITE_URL          <- the Amplify URL, see step 4
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
```

**Optional — the code has defaults**

```
GROQ_MODEL                    qwen/qwen3.8-27b
SARVAM_CHAT_MODEL
SARVAM_TTS_MODEL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SADAK_DDB_REGION              ap-south-1
```

**Do NOT set** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or anything else
`AWS_`-prefixed. Amplify reserves that prefix, and the next step is a better
answer anyway.

## 3. Let the app reach DynamoDB without a key

Amplify's SSR compute runs with an IAM role, and the AWS SDK finds it on its
own — `configured()` in `lib/sim/aws/dynamo.ts` recognises a role exactly as
readily as static keys. So instead of pasting a secret into the console:

IAM → **Roles** → find the Amplify SSR compute role for this app (usually
`AmplifySSRLoggingRole-…` or the service role named in the app's settings) →
*Add permissions* → *Create inline policy* → JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:DeleteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-south-1:*:table/sadak-learner",
        "arn:aws:dynamodb:ap-south-1:*:table/sadak-scenarios"
      ]
    }
  ]
}
```

No `CreateTable` here — the tables already exist, and production has no
business being able to make more. A key in an env var is a key somebody has to
rotate by hand later; a role is not.

## 4. After the first deploy

Amplify gives you a URL like `https://main.d1234abcd.amplifyapp.com`.

1. Set `NEXT_PUBLIC_SITE_URL` to it and redeploy. Auth callbacks are built from
   this, so sign-in will bounce to localhost until it is right.
2. **Supabase** → *Authentication* → *URL Configuration* → add that origin to
   **Redirect URLs** and set it as the **Site URL**. Google sign-in fails with
   a redirect mismatch otherwise, and the error names the wrong thing.

## 5. Check it actually works

In this order, because each one tells you something the next cannot:

1. **The page renders.** Fonts, the ten district cards, no unstyled flash.
2. **Sign in.** If it bounces to localhost, step 4 is not done.
3. **Compile a world.** This is the one that proves the deployment rather than
   the build — it exercises Groq, then writes the scenario to DynamoDB.
4. **Talk to somebody, then reload and talk again.** The reload is the point.
   A second request may land on a different instance, and on serverless
   `tmpdir()` belongs to whichever instance wrote it. If turn two answers, the
   third cache tier is doing its job. If it 404s with "Unknown character",
   check step 3's IAM policy — that is what the symptom means here, however
   much it looks like a broken microphone.

## Cost

Free tier covers this comfortably. DynamoDB is `PAY_PER_REQUEST` with TTL on
the scenario table, so idle weeks cost nothing and old worlds delete
themselves. Amplify's free tier includes build minutes and served GB well
beyond a hackathon's traffic. The organisers have confirmed free tier carries
no prize disadvantage.

## What is deliberately not deployed

`agent.py` — the LiveKit voice agent. It is a separate Python service with its
own Dockerfile and `livekit.toml`, it is shipped and working, and the
simulation layer does not touch it. Deploying it is a separate job with its own
failure modes; do not fold it into this one the week of a deadline.
