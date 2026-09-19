/**
 * WHICH MODEL ANSWERS, AND WHAT HAPPENS WHEN IT CANNOT.
 *
 * There are two reasoning planes now — Groq, which has carried this project so
 * far, and Bedrock, which exists because Groq's account tops out at a 27B that
 * is clumsy in three of the ten languages. This file is the seam between them,
 * and it is the ONLY place that knows there is more than one.
 *
 * WHY A SEAM AND NOT A MIGRATION
 *
 * Because a demo runs once, in front of people, on somebody else's wifi. Every
 * component of it that can fail should have somewhere to fall. Groq being up
 * while Bedrock is mid-incident, or the reverse, should cost a hundred
 * milliseconds and nothing else — so both paths stay wired permanently, and
 * `SIM_LLM_PROVIDER` chooses which one leads rather than which one exists.
 *
 * THE FALLBACK IS ONE WAY AND DELIBERATELY SO
 *
 * Bedrock falls back to Groq. Groq does not fall back to Bedrock. The reason is
 * that Groq is the measured, known-good path with eleven languages of evidence
 * behind it, and Bedrock is new here — falling back TOWARDS the better-
 * understood thing is the only direction that reduces risk. When Bedrock has as
 * much evidence, flip the default and this comment is what needs rewriting.
 *
 * WHAT IS NOT HERE
 *
 * Speech. Sarvam keeps `saaras:v3` in and `bulbul:v3` out, and this file has no
 * opinion about either. AWS Polly speaks one Indian language; Sarvam speaks
 * ten. That is not a close enough call to route.
 */

import { bedrockChat, bedrockConfigured, isAccountPending } from "./bedrock";
import { groqChat, type GroqMessage, type GroqOpts } from "./groq";

export type LlmMessage = GroqMessage;
export type LlmOpts = GroqOpts;

export type Provider = "groq" | "bedrock";

/**
 * Groq until Bedrock has been measured against it side by side.
 *
 * Not because Bedrock is worse — because it is unmeasured, and the whole method
 * of this codebase is that the default is whatever the evidence says. The
 * evidence is one `npm run sim:turn` away, and the day it exists this line
 * changes and nothing else does.
 */
export function provider(): Provider {
  const want = (process.env.SIM_LLM_PROVIDER || "groq").toLowerCase();
  if (want === "bedrock" && bedrockConfigured()) return "bedrock";
  if (want === "bedrock") {
    console.warn("[sim] SIM_LLM_PROVIDER=bedrock but AWS_BEARER_TOKEN_BEDROCK is unset; using groq.");
  }
  return "groq";
}

export async function llmChat(messages: LlmMessage[], opts: LlmOpts): Promise<string> {
  if (provider() !== "bedrock") return groqChat(messages, opts);

  try {
    return await bedrockChat(messages, opts);
  } catch (err) {
    // An aborted turn is the player moving on, not a provider failing. Retrying
    // it on the other plane would spend a call on an answer nobody is waiting
    // for, and would swallow the cancellation the caller asked for.
    if ((err as Error)?.name === "AbortError") throw err;

    const why = isAccountPending(err)
      ? "Bedrock is refusing this account — see docs/AWS.md, not a bug here"
      : (err as Error).message.slice(0, 120);
    console.warn(`[sim] bedrock unavailable (${why}); falling back to groq`);
    return groqChat(messages, opts);
  }
}

/**
 * A turn that must come back as one JSON object.
 *
 * Returns null rather than throwing, and that is load-bearing: every caller is
 * a best-effort pass over a conversation that has already happened. A dropped
 * extraction costs one turn of world drift. A thrown one costs the player their
 * session.
 */
export async function llmJson<T>(messages: LlmMessage[], opts: LlmOpts): Promise<T | null> {
  let raw: string;
  try {
    raw = await llmChat(messages, { ...opts, format: "json", temperature: opts.temperature ?? 0.1 });
  } catch (err) {
    console.warn("[sim] llm call failed:", (err as Error).message);
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    // Some turns arrive wrapped in prose or a fenced block even under a json
    // instruction. Salvage the outermost object before giving up.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) {
      console.warn("[sim] llm returned no JSON object:", raw.slice(0, 200));
      return null;
    }
    try {
      return JSON.parse(raw.slice(start, end + 1)) as T;
    } catch {
      console.warn("[sim] llm returned unparseable JSON:", raw.slice(0, 200));
      return null;
    }
  }
}
