/**
 * The same turn, through both reasoning planes: npm run sim:provider
 *
 * WHY THIS IS A SCRIPT AND NOT A JUDGEMENT CALL
 *
 * The AWS pivot is justified by one claim: that the 27B on the Groq account is
 * clumsy in Punjabi, Odia and Marathi, and that a frontier model is not. That
 * claim is either true or it is a story told to justify the work, and the only
 * difference between the two is whether anybody ran the comparison.
 *
 * So this sends one identical market turn to both providers, in the languages
 * where the difference should show, and prints them next to each other with the
 * latency. Latency matters as much as the words: two of a turn's three calls
 * are on the critical path of a live microphone, and a model that is better and
 * a second slower is not better here.
 *
 *   npm run sim:provider              the three weak languages
 *   npm run sim:provider -- te-IN     one language
 *   npm run sim:provider -- all       all four, including the one qwen is good
 *                                     at — the control, and the thing that
 *                                     would catch a regression sold as a win
 *
 * Read the output yourself. Nothing in here scores a sentence, because a script
 * that graded Punjabi would need to be better at Punjabi than the models it is
 * grading, and if we had that we would not need either of them.
 */
import { config } from "dotenv";
config();

import { bedrockChat, DEFAULT_BEDROCK_MODEL, isAccountPending } from "../lib/sim/bedrock";
import { groqChat, DEFAULT_MODEL } from "../lib/sim/groq";
import type { GroqMessage } from "../lib/sim/groq";

/**
 * The three languages the Groq model is documented as clumsy in, plus Telugu.
 *
 * Telugu is the control. It is the language `groq.ts` says qwen holds cleanly
 * and the one every existing transcript is in, so if Bedrock is WORSE there,
 * that is the finding — and it is the finding that a comparison run only on the
 * weak languages would have been structurally unable to see.
 */
const CASES: { code: string; label: string; script: string; said: string; gloss: string }[] = [
  {
    code: "pa-IN",
    label: "Punjabi",
    script: "Gurmukhi",
    said: "ਟਮਾਟਰ ਕਿੰਨੇ ਦੇ ਹਨ?",
    gloss: "How much are the tomatoes?",
  },
  {
    code: "or-IN",
    label: "Odia",
    script: "Odia",
    said: "ଟମାଟୋ କେତେ?",
    gloss: "How much are the tomatoes?",
  },
  {
    code: "mr-IN",
    label: "Marathi",
    script: "Devanagari",
    said: "टोमॅटो किती रुपये किलो?",
    gloss: "How many rupees a kilo for tomatoes?",
  },
  {
    code: "te-IN",
    label: "Telugu (control)",
    script: "Telugu",
    said: "టమాటా ధర ఎంత?",
    gloss: "What is the price of tomatoes?",
  },
];

function messages(c: (typeof CASES)[number]): GroqMessage[] {
  return [
    {
      role: "system",
      content: `You are a vegetable seller at a market stall. You speak ${c.label} and nothing else.

Tomatoes are 40 rupees a kilo. You have plenty. You are busy but not rude.

Reply with json: {"say": "<what you say out loud>"}

The "say" field must be natural spoken ${c.label} in ${c.script} script — one or two whole sentences, the way a real seller at a real stall talks to a customer. Not a translation exercise, not a textbook line, and not a single word. Do not write any other language in it.`,
    },
    { role: "user", content: `The customer says: ${c.said}` },
  ];
}

type Run = { text: string; ms: number; error?: string };

async function once(
  fn: (m: GroqMessage[], o: { maxTokens: number; temperature: number; format: "json" }) => Promise<string>,
  c: (typeof CASES)[number]
): Promise<Run> {
  const t0 = Date.now();
  try {
    const raw = await fn(messages(c), { maxTokens: 200, temperature: 0.8, format: "json" });
    const ms = Date.now() - t0;
    let text = raw.trim();
    try {
      text = (JSON.parse(text) as { say?: string }).say ?? text;
    } catch {
      /* Print whatever came back. An unparseable answer IS the comparison. */
    }
    return { text, ms };
  } catch (err) {
    const why = isAccountPending(err)
      ? "Bedrock is refusing this account (docs/AWS.md) — not a fault here"
      : (err as Error).message.slice(0, 140);
    return { text: "", ms: Date.now() - t0, error: why };
  }
}

async function main() {
  const arg = process.argv[2];
  const cases =
    !arg || arg === "weak"
      ? CASES.filter((c) => !c.label.includes("control"))
      : arg === "all"
        ? CASES
        : CASES.filter((c) => c.code === arg);

  if (!cases.length) {
    console.error(`No such language. Try one of: ${CASES.map((c) => c.code).join(", ")}, or "all".`);
    process.exit(1);
  }

  const bedrockModel = process.env.AWS_BEDROCK_MODEL || DEFAULT_BEDROCK_MODEL;
  console.log(`\n  groq     ${DEFAULT_MODEL}`);
  console.log(`  bedrock  ${bedrockModel}`);
  console.log(`  region   ${process.env.AWS_BEDROCK_REGION || process.env.AWS_REGION || "us-east-1"}\n`);

  for (const c of cases) {
    console.log(`${"─".repeat(72)}\n  ${c.label}  —  customer: ${c.said}  (${c.gloss})\n`);

    // Sequential, not parallel. Two providers racing each other distort each
    // other's latency, and latency is half of what is being measured.
    const g = await once(groqChat, c);
    const b = await once(bedrockChat, c);

    for (const [name, r] of [
      ["groq   ", g],
      ["bedrock", b],
    ] as const) {
      if (r.error) console.log(`  ${name}  ${String(r.ms).padStart(5)}ms  ✗ ${r.error}`);
      else console.log(`  ${name}  ${String(r.ms).padStart(5)}ms  ${r.text}`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
