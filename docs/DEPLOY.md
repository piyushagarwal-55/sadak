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

## Read this before step 1

**Set the environment variables while you create the app, not after.** Amplify
starts a build the instant the app exists, and this build fails with no
environment:

```
Error: Missing NEXT_PUBLIC_SUPABASE_URL
Export encountered an error on /roznamcha/page, exiting the build.
```

Verified from a clean clone of this repo. `/roznamcha` and `/_not-found` are
prerendered, and the Supabase client they pull in reads that variable at build
time. The *values* are irrelevant to the build — placeholders compile fine, the
names just have to exist — but they matter at runtime, so use the real ones.

In the create flow the field is under **Advanced settings → Environment
variables**. If you miss it, nothing is broken: set them afterwards and hit
*Redeploy this version*.

## 1. Create the Amplify app — in the CONSOLE, not the CLI

Console → **Amplify** → region **N. Virginia (us-east-1)** → *Create new app* →
**GitHub** → authorise → `piyushagarwal-55/sadak`, branch `main`.

**Use the console for this step even if you are otherwise driving from the CLI.**
It is the only way to connect the repository through Amplify's **GitHub App**.
`aws amplify create-app --access-token <PAT>` also "works" — it returns an app
with the repo attached — and then every build fails in 20-60 seconds with:

```
!!! Unable to assume specified IAM Role. Please ensure the selected IAM Role
    has sufficient permissions and the Trust Relationship is configured correctly.
```

That message is a lie. There is nothing wrong with the role. Amplify reports an
unreachable repository as an IAM error, and it took eight failed builds — new
roles, corrected trust policies, regional service principals, two regions, and
a run with no roles attached at all — before switching the connection to the
GitHub App made it clone on the first attempt. **If you see that error, look at
the repo connection, not at IAM.**

Not **ap-south-1**, despite the tables being there: this account cannot create
Amplify apps in Mumbai at all (see *Account restrictions* below). The app runs
in us-east-1 and reaches the Mumbai tables across regions, which is exactly why
`tableRegion()` is pinned rather than reading `AWS_REGION`.

If Amplify offers to generate a build spec, decline — the `amplify.yml` in the
repo is the one that knows the app is not at the root.

## 2. Environment variables

Amplify → *Hosting* → **Environment variables**. Copy these from
`game_engine/.env`:

**Required** - the build fails, or the app is wrong, without these:

```
AMPLIFY_MONOREPO_APP_ROOT=game_engine  see below - not optional
NEXT_PUBLIC_SUPABASE_URL              throws at build time
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  throws at build time
SUPABASE_SECRET_KEY
GROQ_API_KEY                          the reasoning plane
SARVAM_API_KEY                        speech in and out
NEXT_PUBLIC_SITE_URL                  see below
LIVEKIT_URL / _API_KEY / _API_SECRET  live-voice path only
```

`AMPLIFY_MONOREPO_APP_ROOT=game_engine` is the one that is easy to miss, because
`amplify.yml` already declares `appRoot: game_engine` and it looks redundant. It
is not. Amplify's framework detection runs BEFORE it reads the build spec, so
without the variable it looks for `package.json` at the repo root, does not find
one, and stops:

```
CustomerError: Cannot read 'next' version in package.json.
If you are using monorepo, please ensure that AMPLIFY_MONOREPO_APP_ROOT is set
```

`NEXT_PUBLIC_SITE_URL` is the quiet one. Unset, it does not fail -- it falls
back to `https://playsadak.vercel.app`, so OG tags and auth callbacks point at
the old domain and sign-in breaks in a way that blames Supabase. Set it to the
Amplify URL after the first deploy and redeploy.

**Optional** - the code has defaults, and blank only means analytics are
dropped with a warning:

```
GROQ_MODEL                         defaults to qwen/qwen3.8-27b
SARVAM_CHAT_MODEL, SARVAM_TTS_MODEL
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, NEXT_PUBLIC_POSTHOG_HOST
SADAK_DDB_REGION                   defaults to ap-south-1
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is **not** needed: it is only a legacy fallback
for the publishable key, which you are setting.

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

0. **It is live.** Verified 20 Sep 2026:
   `https://main.d33zh3b90nj4kw.amplifyapp.com` -> 307 `/login?next=%2F`,
   then 200 in 0.83s, `self.__next_f` present (so it really is SSR and not a
   static export), `og:url` set to the Amplify domain, no console errors.
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

## Account restrictions on this AWS account

Measured on 20 Sep 2026, account `357199110742`. None of these are
configuration problems and none can be fixed from this repo.

| Symptom | Reality |
|---|---|
| Amplify in **ap-south-1**: *"You have reached the maximum number of apps in this account"* | 1 app existed; the quota is 25. Creating the same app in us-east-1 succeeded instantly. |
| Creating a **second** app anywhere: same message | The account holds exactly one Amplify app. Deletion is asynchronous, so the slot does not free immediately. |
| Bedrock: `400 Operation not allowed` on every model, every region | Applied invocation quota of 0 for every model, while batch quotas sit at their defaults. See docs/AWS.md. |

The pattern is a new account that has not been fully released. It reports each
restriction as something it is not — a quota that is actually zero, a limit that
is not reached, a role that is not the problem. **When an AWS error on this
account does not match what you can see, suspect the account before the config.**

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
