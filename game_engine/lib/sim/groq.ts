/**
 * Server-only Groq client — the reasoning plane.
 *
 * The split, and why:
 *
 *   Sarvam  — speech. `saaras:v3` in, `bulbul:v3` out. Nothing else comes close
 *             on code-switched Hindi, and the existing voice path is tuned
 *             around it, so it is untouched by the simulation layer.
 *   Groq    — thinking. Scenario compilation, extracting world mutations out of
 *             a conversation, grading a run. All of it JSON, all of it off the
 *             critical path or ahead of it, and all of it fast enough that
 *             "off the critical path" stays true.
 *
 * MEASURED ON THIS ACCOUNT (2026-09-17), because none of it is obvious:
 *
 *   - Most models are blocked at the org level — `openai/gpt-oss-120b` and
 *     `-20b`, `groq/compound*`, `allam-2-7b` all 403. Only the qwen pair runs.
 *     If a call starts failing with 403 "blocked at the organization level",
 *     that is the org settings, not the key.
 *   - `qwen/qwen3.8-27b` holds Devanagari cleanly and answers a one-line NPC
 *     turn in ~0.4s. `qwen/qwen3.6-27b` leaks its reasoning into `content`
 *     ("Let me think about what a typical driver would say…"), which on the
 *     voice path would be read aloud. Do not swap the default without checking
 *     that again.
 *   - `response_format: json_object` is reliable here.
 *   - Tool calling works but costs ~2.5s, six times a plain turn. That is why
 *     NPCs are handed a rendered context block rather than tools: on a live
 *     microphone the round trip is the whole experience.
 *   - Rate limits are generous (500k req, 250k tok/min), so retries are cheap.
 */

import { DEFAULT_RETRY_OPTS, withRetry } from "@/lib/retry";

const BASE = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

/**
 * THE ONLY MODEL ON THIS ACCOUNT THAT IS BOTH OPEN AND SANE.
 *
 * Measured against the live account, all fourteen visible models:
 *   qwen/qwen3.8-27b    works, ~900ms, holds the JSON contract in all ten
 *                       languages. This one.
 *   openai/gpt-oss-120b 403, blocked at the organisation level. It is the
 *                       obvious candidate for the languages qwen is clumsy in
 *                       — Punjabi, Odia, Marathi — and it needs an org admin
 *                       to enable it in the Groq console, which is not
 *                       something this codebase can do.
 *   qwen/qwen3.6-27b    400, json_validate_failed with an empty generation.
 *   the rest            guards, whisper, TTS, or Arabic.
 */
export const KNOWN_GOOD_MODEL = "qwen/qwen3.8-27b";

export const DEFAULT_MODEL = process.env.GROQ_MODEL || KNOWN_GOOD_MODEL;

/**
 * Errors that mean "this model, not this request".
 *
 * A blocked model and a model that cannot produce the JSON both fail every
 * single call, so retrying the same one is pointless and failing outright turns
 * one wrong environment variable into a dead demo. See `groqChat`: the call is
 * repeated once against the model we know works, so trying a bigger model the
 * day it is unblocked costs nothing if it turns out still to be blocked.
 */
function isModelFault(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  if (e?.status === 403) return true;
  return e?.status === 400 && /json_validate_failed|model/i.test(e.message ?? "");
}

function key(): string {
  const k = process.env.GROQ_API_KEY;
  if (!k) throw new Error("GROQ_API_KEY is not set. Add it to game_engine/.env.");
  return k;
}

export type GroqMessage = { role: "system" | "user" | "assistant"; content: string };

export type GroqOpts = {
  /**
   * REQUIRED, and deliberately so.
   *
   * This used to default to 512, which silently truncated anything larger than
   * a chat reply — a world spec sent through this wrapper would have come back
   * cut off mid-object, parsed as unrepairable JSON, and fallen through to the
   * fallback path with no error anywhere. Every caller now has to state its own
   * ceiling, which forces the question "how big is this answer" to be asked
   * once per call site instead of never.
   */
  maxTokens: number;
  model?: string;
  temperature?: number;
  /** `json` asks for a single JSON object and is the shape every caller here wants. */
  format?: "text" | "json";
  /**
   * A JSON schema the API itself enforces, for calls that are measurements.
   *
   * `response_format: json_object` asks politely and validates nothing; this is
   * `json_schema` with `strict`, so a field out of its enum is impossible
   * rather than unlikely. Verified working on qwen3.8-27b. Used by `read.ts`,
   * where the whole value of the call is that its answer has a known shape —
   * the speaking call stays on plain json, because its fields are sentences and
   * a schema has nothing to say about those.
   */
  schema?: { name: string; schema: unknown };
  signal?: AbortSignal;
};

export async function groqChat(messages: GroqMessage[], opts: GroqOpts): Promise<string> {
  const wanted = opts.model ?? DEFAULT_MODEL;
  try {
    return await call(messages, opts, wanted);
  } catch (err) {
    if (wanted === KNOWN_GOOD_MODEL || !isModelFault(err)) throw err;
    console.warn(`[sim] ${wanted} is unusable (${(err as Error).message.slice(0, 80)}); falling back`);
    return call(messages, opts, KNOWN_GOOD_MODEL);
  }
}

async function call(messages: GroqMessage[], opts: GroqOpts, model: string): Promise<string> {
  const json = await withRetry(async () => {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens,
        ...(opts.schema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: { name: opts.schema.name, strict: true, schema: opts.schema.schema },
              },
            }
          : opts.format === "json"
            ? { response_format: { type: "json_object" } }
            : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`Groq ${res.status}: ${body.slice(0, 300)}`) as Error & {
        status: number;
      };
      err.status = res.status;
      throw err;
    }

    return res.json();
  }, DEFAULT_RETRY_OPTS);

  const choice = json?.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    throw new Error(`Groq returned no content (finish_reason: ${choice?.finish_reason ?? "?"}).`);
  }
  return content;
}
