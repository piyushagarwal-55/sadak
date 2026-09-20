# SADAK — demo video script

Runs about 2 minutes 45. Live at https://main.d33zh3b90nj4kw.amplifyapp.com

Each beat gives you the screen action, the words, and roughly how long it takes.
The spoken lines are written to be said out loud. Read them a couple of times
first and then say them your own way — a script you are reciting sounds like a
script.

---

## Before recording

1. **Play the whole demo through once.** Audio for each line is generated the
   first time it is spoken and cached after that. One pass fills the cache and
   every take afterwards plays instantly.
2. **Compile the railway world in a second tab and leave it open.** The last
   beat is a glance at it. Generating it on camera costs you twenty dead
   seconds.
3. **Test the microphone in the browser you will record in.** Chrome asks for
   permission the first time, and that dialog will otherwise appear in the
   middle of a take.
4. **Sign out**, so the recording opens on the login screen.
5. Close other tabs. The 3D world and the screen recorder are both competing for
   the GPU.
6. Record at 1080p or better. Text on the dialogue card has to be readable.

---

## Beat 1 — the problem · 0:00–0:15

**Screen:** Login page, still. Do not move the cursor while you say the first
sentence.

> Every year, millions of people in India move to a city that speaks a language
> they don't. You can finish an entire course and still freeze at a vegetable
> stall.

**Screen:** Move to **Continue as guest** and click it.

> SADAK is built for that moment. No account — you can open it as a guest.

**Delivery:** Say the first line slower than feels natural. It is the only part
of the video where you are asking someone to care rather than showing them
something.

---

## Beat 2 — two pickers · 0:15–0:42

**Screen:** The ten city cards. Move across Hyderabad, Amritsar, Kolkata as you
name them.

> Ten cities. Each one speaks its own language — Telugu in Hyderabad, Punjabi in
> Amritsar, Bengali in Kolkata.

**Screen:** Scroll to the second picker. Rest the cursor on the language list.

> Then you say which language you already understand. Every hint, every meaning,
> every correction comes back in that one. So someone who only speaks Tamil can
> learn Hindi without going through English first.

**Screen:** Pick Hyderabad, pick your level, click **Enter**.

> I'll take Hyderabad. I read English.

**Delivery:** Do not rush the second picker. It is the difference between an app
for people who already speak English and an app for everyone else, and it takes
one sentence to explain.

---

## Beat 3 — the two ways in · 0:42–1:00

**Screen:** The screen offering **Just walk in** and the describe box.

> There are two ways in.

**Screen:** Point at **Just walk in**.

> If you want general practice, walk straight in. The errands are already
> written for the city.

**Screen:** Move to the describe box. Type slowly enough to be read:
`I want to buy vegetables at the market`

> Or — say you're actually going to the market tomorrow. You type that, in
> English, and it builds you that street. That seller, that conversation.

**Screen:** Do not submit. Click **Just walk in** instead.

> The city first.

**Delivery:** This is the pitch. Slow down. Everything before it is setup and
everything after it is evidence.

---

## Beat 4 — walking and talking · 1:00–1:22

**Screen:** The street loads. Walk a few steps so it is obvious you are moving,
not watching a video.

> This is Charminar Lane. You walk it.

**Screen:** Approach a character until the dialogue opens.

> Everyone here speaks Telugu. Nothing else.

**Screen:** Hold the mic button, say your line in Telugu, release. Let the reply
play out loud.

> *(say nothing — let the answer play)*

**Screen:** Point at the three lines under her reply, then at the card below.

> What she said. How to pronounce it. What it means. And down here, what I could
> say back.

**Delivery:** Stay quiet while she answers. Three seconds of a Telugu seller
replying to you does more than any sentence you could put on top of it.

**If speech fails:** the card has a keyboard toggle. Type the phrase and carry
on. Do not stop to explain what went wrong.

---

## Beat 5 — a world from one sentence · 1:22–2:10

**Screen:** Exit back to the two doors.

> Now the other way in.

**Screen:** Type `I want to buy vegetables at the market` and submit.

> I tell it what I'm doing tomorrow.

**Screen:** The world compiles. Let it run — do not talk over the whole wait.

> It's building the street now. The stalls, who's selling, what they have, what
> they charge, and what I have to get done.

**Screen:** The market loads.

> I didn't pick this off a list. I wrote one sentence.

**Screen:** Walk to the vegetable seller. Open the dialogue. Point at the
errand panel.

> The errand is a kilo of tomatoes. She's asking forty rupees a kilo.

**Screen:** Speak. Haggle. Let it run three or four turns.

> *(quiet through the exchange)*

**Screen:** Point at the wallet as the number changes.

> She came down to thirty-five, and the money actually left my wallet. That
> price isn't the model inventing a number. The engine sets what she can charge
> and what she has in stock, and the model can't go outside it.

**Delivery:** This is your strongest stretch. Give it the time. A model that
cannot invent a price is the difference between a simulation and a chatbot in a
costume, and the wallet changing on screen is the proof.

---

## Beat 6 — a second situation · 2:10–2:25

**Screen:** Switch to the tab with the railway world already loaded.

> Different sentence, different world. A railway station.

**Screen:** Show the ticket counter and the errands panel.

> Buy a ticket. Find the platform. Same way in.

**Delivery:** Fifteen seconds, no more. This beat exists to show the last one
was not a one-off.

---

## Beat 7 — close · 2:25–2:45

**Screen:** Back on the street, walking.

> Ten languages, your own voice, and a world built from one line of English.

**Screen:** Let the address bar be visible for a moment.

> It's running on AWS — Amplify serving the app, DynamoDB holding the worlds it
> generates.

**Screen:** Keep walking as you finish.

> The link is in the description. It opens as a guest.

---

## If you run long

Cut in this order:

1. Beat 6, the railway world.
2. The level picker in beat 2.
3. The AWS sentence in beat 7 — the submission form already says where it runs.

Do not cut the second language picker, the describe box, or the haggle. Those
three are the product.

---

## What you can say safely

All of this is true and visible in the recording:

- ten Indian cities, ten languages
- you speak, the characters answer out loud
- a 3D world generated from one sentence of plain English
- the engine sets prices and stock; the model cannot invent them
- deployed on AWS, using Amplify and DynamoDB
- no sign-up

Leave out Bedrock. The integration is written and one environment variable from
running, but the quotas on this AWS account are set to zero, so the recording
runs on Groq. If a judge asks what the reasoning runs on, the honest answer is
good — a provider seam with a tested fallback, currently on Groq because Bedrock
access has not come through. It just is not a claim to put in the video.

---

## Recovery

**The world fails to compile.** Reload and use the authored Hyderabad bazaar
instead. The haggle works the same way and nobody watching knows which one you
meant to show.

**Speech is not recognised.** Switch to the keyboard toggle and keep talking
over it. Retrying the microphone three times on camera is worse than typing.

**Audio doesn't play.** The cache is cold — press "hear it" once, then re-record
the beat.

**The page is slow on first load.** Serverless cold start. Load it once before
you record so the instance is warm.
