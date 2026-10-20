import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { gemini } from "./gemini";
import {
  SpendCapError,
  type CallInfo, type CallMeta, type ChatRequest, type ChatResponse, type JsonRequest, type JsonResponse, type LlmProvider, type ReadPageRequest, type ReadPageResponse,
} from "./types";

export * from "./types";

function provider(): LlmProvider {
  const name = process.env.LLM_PROVIDER ?? "gemini";
  if (name === "gemini") return gemini;
  // DeepSeek / Grok adapters: implement LlmProvider in ./deepseek.ts or ./grok.ts and add them here.
  throw new Error(`LLM provider «${name}» is not implemented yet`);
}

const CAP = () => Number(process.env.LLM_SPEND_CAP_USD ?? "5");

/** Total spent so far across all offices (the test cap is global). */
export async function spentUsd(): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db.from("llm_calls").select("cost_usd");
  if (error) throw new Error(`llm_calls read failed: ${error.message}`);
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
}

async function log(meta: CallMeta, p: string, info: Partial<CallInfo> & { model: string }, ok: boolean, error?: string) {
  const db = createAdminClient(); // server-only: the cost log is written with the secret key
  await db.from("llm_calls").insert({
    office_id: meta.officeId ?? null,
    user_id: meta.userId ?? null,
    thread_id: meta.threadId ?? null,
    document_id: meta.documentId ?? null,
    purpose: meta.purpose,
    provider: p,
    model: info.model,
    input_tokens: info.usage?.inputTokens ?? null,
    output_tokens: info.usage?.outputTokens ?? null,
    cost_usd: info.costUsd ?? 0,
    latency_ms: info.latencyMs ?? null,
    ok,
    error: error?.slice(0, 500) ?? null,
  });
  if (ok) console.log(`[llm] ${meta.purpose} ${info.model} in=${info.usage?.inputTokens} out=${info.usage?.outputTokens} $${(info.costUsd ?? 0).toFixed(5)} ${info.latencyMs}ms`);
}

async function guarded<T extends CallInfo>(meta: CallMeta, model: string, run: (p: LlmProvider) => Promise<T>): Promise<T> {
  const spent = await spentUsd();
  if (spent >= CAP()) throw new SpendCapError(spent, CAP());
  const p = provider();
  const started = Date.now();
  try {
    const r = await run(p);
    await log(meta, p.name, r, true);
    return r;
  } catch (e) {
    await log(meta, p.name, { model, latencyMs: Date.now() - started }, false, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** The only LLM entry point for app code. */
export function getLlm() {
  return {
    chat: (req: ChatRequest): Promise<ChatResponse> => guarded(req.meta, req.model ?? process.env.LLM_CHAT_MODEL ?? "?", (p) => p.chat(req)),
    readPage: (req: ReadPageRequest): Promise<ReadPageResponse> => guarded(req.meta, process.env.LLM_DOC_MODEL ?? "?", (p) => p.readPage(req)),
    json: <T>(req: JsonRequest): Promise<JsonResponse<T>> => guarded(req.meta, req.model ?? process.env.LLM_CHAT_MODEL ?? "?", (p) => p.json<T>(req)),
  };
}
