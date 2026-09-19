/**
 * Server-only Bedrock client — the second reasoning plane.
 *
 * WHY THIS EXISTS
 *
 * `groq.ts` documents the ceiling this project hit: the only model open on that
 * account is a 27B that holds Devanagari cleanly and is visibly clumsy in
 * Punjabi, Odia and Marathi. The obvious fix — a bigger model — is 403 at the
 * org level and needs an admin this codebase does not have. That is a quality
 * problem in three of the ten languages, and no amount of prompt work moves it.
 *
 * Bedrock is the way around it, and the reason for the AWS pivot.
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * Not a replacement. `llm.ts` picks between the two and falls back, and both
 * paths stay wired permanently. A demo that cannot fall back mid-flight is a
 * demo with one point of failure, and this one runs on a stage.
 *
 * NO SDK, ON PURPOSE
 *
 * This account uses a Bedrock API KEY, which is a bearer token — the same
 * `Authorization: Bearer` header the Groq client already uses. That means no
 * SigV4, no credential chain, and no `@aws-sdk/*` in `package.json` for what is
 * ultimately one POST. If this ever moves to IAM role credentials, that is when
 * the SDK earns its place, and not before.
 *
 * MEASURED ON THIS ACCOUNT (2026-09-19):
 *
 *   - `ListFoundationModels` returns 84 text models and
 *     `enableAccessToAllModelsByDefault: true`, so there is no model-access
 *     request to file. Every Anthropic model is INFERENCE_PROFILE only, which
 *     is why the default below is a `us.` profile id and not a bare model id —
 *     a bare `anthropic.claude-...` is a 400 here, not a 404.
 *   - `bedrock-runtime` refuses this account in every region tested, and has
 *     not cleared on its own. It is an activation hold on the account — not
 *     the key, not the region, not the model. See `isAccountPending` below and
 *     docs/AWS.md; it is why `SIM_LLM_PROVIDER` still says `groq`.
 */

import { DEFAULT_RETRY_OPTS, withRetry } from "@/lib/retry";
import type { GroqMessage, GroqOpts } from "./groq";

/**
 * Fast, not clever, and that is the requirement.
 *
 * A turn is three model calls and two of them are on the critical path of a
 * live microphone. Haiku answers a market line in well under a second, which is
 * the difference between a conversation and a form. Sonnet is the switch to
 * throw if the three weak languages need it — one env var, no code.
 *
 * The `us.` prefix is a cross-region inference profile and is REQUIRED: every
 * Anthropic model on this account is INFERENCE_PROFILE-only.
 */
export const DEFAULT_BEDROCK_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

function region(): string {
  return process.env.AWS_BEDROCK_REGION || process.env.AWS_REGION || "us-east-1";
}

function token(): string {
  const t = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!t) {
    throw new Error("AWS_BEARER_TOKEN_BEDROCK is not set. Add it to game_engine/.env.");
  }
  return t;
}

export function bedrockConfigured(): boolean {
  return Boolean(process.env.AWS_BEARER_TOKEN_BEDROCK);
}

/**
 * Bedrock refusing this account, named so it is not mistaken for a bad key.
 *
 * This account is under an activation hold on Bedrock, and the hold reports
 * itself differently by region. Measured, same key, same call, six regions:
 *
 *   eu-west-1, ap-southeast-1, us-east-2
 *                    "Your account is currently being verified."
 *   us-east-1, us-west-2, ap-south-1
 *               400  "Operation not allowed"  (and once, 429 "Too many tokens
 *                    per day", which is the same gate wearing a third hat)
 *
 * Only some of those tell the truth. The rest read exactly like a bug in this
 * file — a malformed body, a bad model id, a missing permission — and the
 * control plane answers 200 throughout, which is what makes it so convincing:
 * the key is plainly valid, so the fault looks like ours.
 *
 * CHANGING REGION DOES NOT HELP, and neither does the model: it refuses
 * Anthropic, Amazon Nova and DeepSeek alike, across `us.` / `apac.` / `eu.` /
 * `global.` profiles. The zero applied quotas in Service Quotas are the hold
 * being expressed rather than a separate cause, so raising them may not lift
 * it. docs/AWS.md has the full trail, including the three wrong diagnoses it
 * took to get here.
 *
 * Hence this. It is generous on purpose: a false positive logs "Bedrock is
 * refusing this account" and falls back to Groq, which is what we would do
 * anyway. A false negative sends someone hunting a bug that is not there.
 */
export function isAccountPending(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  const m = e?.message ?? "";
  if (/being verified/i.test(m)) return true;
  if (e?.status === 400 && /operation not allowed/i.test(m)) return true;
  return e?.status === 429 && /tokens per day/i.test(m);
}

type ConverseBlock = { text: string } | { toolUse: { name: string; input: unknown } };
type ConverseMessage = { role: "user" | "assistant"; content: ConverseBlock[] };

/**
 * OpenAI's message list into Bedrock's, which is a different shape in three ways.
 *
 * Converse takes `system` as its own top-level field rather than a role, wraps
 * every message's content in typed blocks, and rejects two messages in a row
 * from the same role. The callers here all send `[system, user]` so none of
 * that bites today — it is handled anyway because the day someone passes a
 * transcript through is not the day to discover the rule.
 */
function convert(messages: GroqMessage[]): { system: string[]; turns: ConverseMessage[] } {
  const system: string[] = [];
  const turns: ConverseMessage[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      system.push(m.content);
      continue;
    }
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) {
      last.content.push({ text: m.content });
    } else {
      turns.push({ role: m.role, content: [{ text: m.content }] });
    }
  }

  // Converse requires the first turn to be the user's. An assistant-led list
  // would 400; dropping the orphan is better than failing the turn.
  while (turns.length && turns[0].role === "assistant") turns.shift();
  if (!turns.length) turns.push({ role: "user", content: [{ text: "(nothing)" }] });

  return { system, turns };
}

export async function bedrockChat(messages: GroqMessage[], opts: GroqOpts): Promise<string> {
  // `||` on the env var, not `??`: `.env` ships it as an empty string on
  // purpose, and an empty string is not nullish. `??` there would send "" as
  // the model id and 400 every call.
  const model = opts.model ?? (process.env.AWS_BEDROCK_MODEL || DEFAULT_BEDROCK_MODEL);
  const { system, turns } = convert(messages);

  /**
   * TWO WAYS TO GET JSON, AND THEY ARE NOT THE SAME STRENGTH.
   *
   * Bedrock has no `response_format`. A schema'd call becomes a forced tool
   * call, which is the real equivalent of `json_schema` + `strict`: the model
   * cannot return a field outside its enum because the API will not accept one.
   * That is what `read.ts` needs, since the entire value of that call is that
   * its answer has a known shape.
   *
   * A schemaless json call gets a prefilled `{` instead — an assistant turn the
   * model must continue, so it cannot open with prose. Weaker, but those calls
   * return sentences, and a schema has nothing useful to say about a sentence.
   * Prefill and tools are mutually exclusive, hence the branch.
   */
  const wantsTool = Boolean(opts.schema);
  const prefill = !wantsTool && opts.format === "json";
  if (prefill) turns.push({ role: "assistant", content: [{ text: "{" }] });

  const json = await withRetry(async () => {
    const res = await fetch(
      `https://bedrock-runtime.${region()}.amazonaws.com/model/${encodeURIComponent(model)}/converse`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        signal: opts.signal,
        body: JSON.stringify({
          messages: turns,
          ...(system.length ? { system: system.map((text) => ({ text })) } : {}),
          inferenceConfig: {
            maxTokens: opts.maxTokens,
            temperature: opts.temperature ?? 0.7,
          },
          ...(opts.schema
            ? {
                toolConfig: {
                  tools: [
                    {
                      toolSpec: {
                        name: opts.schema.name,
                        description: "Report the result. Call this exactly once.",
                        inputSchema: { json: opts.schema.schema },
                      },
                    },
                  ],
                  toolChoice: { tool: { name: opts.schema.name } },
                },
              }
            : {}),
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`Bedrock ${res.status}: ${body.slice(0, 300)}`) as Error & {
        status: number;
      };
      err.status = res.status;
      throw err;
    }

    return res.json();
  }, DEFAULT_RETRY_OPTS);

  const blocks: ConverseBlock[] = json?.output?.message?.content ?? [];

  if (wantsTool) {
    const call = blocks.find(
      (b): b is { toolUse: { name: string; input: unknown } } => "toolUse" in b
    );
    if (!call) {
      throw new Error(`Bedrock did not call the tool (stop: ${json?.stopReason ?? "?"}).`);
    }
    // The caller parses a string, so the tool's already-structured input is
    // re-serialised rather than given a second return type. One contract.
    return JSON.stringify(call.toolUse.input);
  }

  const text = blocks
    .map((b) => ("text" in b ? b.text : ""))
    .join("")
    .trim();
  if (!text) {
    throw new Error(`Bedrock returned no content (stop: ${json?.stopReason ?? "?"}).`);
  }

  // The prefilled brace is ours, not the model's, and the parser needs it back.
  return prefill ? `{${text}` : text;
}
