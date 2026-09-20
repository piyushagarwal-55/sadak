# SADAK — demo video script

Target: **2 minutes 30**. Live at https://main.d33zh3b90nj4kw.amplifyapp.com

Two columns: what is on screen, and what you say over it. The spoken lines are
written to be said out loud, not read — short sentences, no clauses stacked up.
Say them in your own words if a phrase feels unnatural in your mouth.

---

## Before you hit record

These are the things that ruin a take, in the order they usually do it.

1. **Play through the whole demo once.** The text-to-speech cache is cold on a
   fresh deploy, so the very first time a line is spoken it has to be generated.
   Playing through once fills the cache and every take after that is instant.
2. **Test the microphone in the browser you will record in.** Chrome asks for
   permission the first time and that dialog will land in the middle of your
   take otherwise.
3. **Close other tabs.** The 3D world and the recorder are both asking for the
   GPU.
4. **Have the railway world already compiled in a second tab.** The last beat is
   a look, not a wait — do not generate it on camera.
5. **Sign out first**, so the recording starts at the login screen.

---

## 0:00 – 0:12 · The hook

| Screen | Say |
|---|---|
| Login page. Cursor moves toward **Continue as guest**. | "India has twenty-two official languages. Most people move to a city that speaks one they do not. Apps teach you to pass a test. Nobody teaches you to buy vegetables." |
| Click **Continue as guest**. | "No sign-up. This is SADAK." |

> Leading with the guest button is deliberate — it shows a judge they can open
> the link themselves without making an account.

---

## 0:12 – 0:32 · Two choices that define the product

| Screen | Say |
|---|---|
| The ten city cards. Hover across a few — Hyderabad, Amritsar, Kolkata. | "First, pick a city. Each one speaks its own language — Telugu in Hyderabad, Punjabi in Amritsar, Bengali in Kolkata. Ten cities, ten languages." |
| Scroll to the second picker. Point at **English**. | "Then tell it what *you* already know. Everything is explained back to you in this language. So a Tamil speaker learning Hindi reads the meaning in Tamil, not in English." |
| Pick **Hyderabad**, level, click **Enter**. | "I am going to Hyderabad. I speak English. Let us walk." |

> That second picker is the part people miss. Say it clearly — it is what makes
> this usable by someone who does not already speak English.

---

## 0:32 – 0:48 · The two doors

| Screen | Say |
|---|---|
| The screen showing **Just walk in** and the describe option. | "Now there are two ways in." |
| Point at **Just walk in**. | "If you just want to learn the language, walk straight in. The errands are already written." |
| Point at the describe box. Type slowly: `I want to buy vegetables at the market` | "But say tomorrow you are actually going to the market to buy vegetables. Describe it — in plain English — and SADAK builds that world for you. A real street, real people, that exact situation." |
| Do **not** submit yet. Click **Just walk in**. | "First, the city itself." |

> This is the whole pitch in fifteen seconds. Slow down here. Everything before
> is setup and everything after is proof.

---

## 0:48 – 1:10 · Walking the street

| Screen | Say |
|---|---|
| The 3D street loads. Walk a few steps. | "This is Charminar Lane. It is a real street you walk." |
| Walk up to a character. The dialogue opens. | "Every person here speaks Telugu and only Telugu." |
| **Hold the mic and speak.** Let the reply play out loud. | *(say nothing while it answers — let the voice carry it)* |
| Point at the three lines under the reply. | "What she said. How to pronounce it. What it means. And here — what I could say back." |

> Let the audio breathe. The temptation is to talk over your own product; do
> not. Two seconds of a Telugu vegetable seller answering you is worth more than
> anything you could say on top of it.

**If speech fails on the take:** the card at the bottom has a keyboard toggle.
Type the phrase instead and keep going. Do not stop to explain it.

---

## 1:10 – 1:55 · The part nobody else has

| Screen | Say |
|---|---|
| Exit. Back at the two doors. | "Now the other way in." |
| Type: `I want to buy vegetables at the market`. Submit. | "I tell it what I am doing tomorrow." |
| The world compiles. Let it run. | "It is building the world. The stalls, the seller, what she sells, what she charges — and the errands." |
| The market loads. | "I did not pick this from a menu. I described it in a sentence." |
| Walk to the vegetable seller. | "Here is the errand — buy a kilo of tomatoes. She wants forty rupees." |
| **Speak. Haggle. Let it run three or four turns.** | *(quiet — let the exchange play)* |
| Point at the wallet as it changes. | "She came down to thirty-five. And the money actually moved." |

> The haggle is your strongest twenty seconds. The price ladder is real — the
> engine sets it, the model cannot invent a number. If she comes down and the
> wallet changes, you have shown a working simulation and not a chatbot with a
> costume on.

---

## 1:55 – 2:10 · Breadth

| Screen | Say |
|---|---|
| Switch to the tab with the railway world. | "Same sentence, different situation. A railway station." |
| Show the ticket counter and the errands panel. | "Buy a ticket. Find the platform. Different place, different words, same way in." |

> Fifteen seconds. Do not linger — this beat exists to prove the first one was
> not a one-off.

---

## 2:10 – 2:30 · Close

| Screen | Say |
|---|---|
| Back to the street, walking. | "Ten languages. Speech in and speech out. Worlds built from a sentence." |
| Optional: a flash of the Amplify URL in the address bar. | "It runs on AWS — Amplify for the app, DynamoDB for the worlds it builds." |
| Last line, over the street. | "Most apps teach you a language. SADAK teaches you a street." |

---

## Lines to cut if you run long

In this order:

1. The railway beat (1:55–2:10) — breadth is the first thing to go.
2. The level picker in the 0:12 section.
3. The AWS line in the close — the submission form already says where it runs.

**Never cut:** the second language picker, the describe-a-scenario box, or the
haggle. Those three are the product.

---

## Claims that are safe to make

Say these; they are all true and demonstrable on the recording:

- ten Indian languages
- speech in and speech out
- a 3D world generated from one sentence of plain English
- the engine sets the prices — the model cannot invent one
- deployed on AWS, Amplify plus DynamoDB
- no sign-up needed

**Do not say** the reasoning runs on Bedrock. The integration is built and one
environment variable away, but this account's Bedrock quotas are held at zero,
so the recording runs on Groq. If a judge asks, that is a good answer — a
provider seam with a tested one-way fallback — but it is not a claim to make in
a video.
