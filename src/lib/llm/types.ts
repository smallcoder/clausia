/**
 * Provider-neutral LLM interface. App code talks only to `getLlm()` (./index.ts); Gemini, DeepSeek or Grok
 * plug in behind it by config (LLM_PROVIDER). Every call is logged to llm_calls with cost + latency and
 * refused once the spend cap is reached.
 */

export type JsonSchema = Record<string, unknown>;

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema; // JSON Schema of the args object
}

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LlmImage {
  mime: string; // image/jpeg, image/png, application/pdf
  base64: string;
}

export type LlmMessage =
  | { role: "user"; text: string; files?: LlmImage[] }
  /** `raw` = the provider's own content object (e.g. Gemini parts with thought signatures). Send it back unchanged. */
  | { role: "assistant"; text: string; toolCalls?: LlmToolCall[]; raw?: unknown }
  | { role: "tool"; results: { callId: string; name: string; result: unknown }[] };

/** Who/what the call is for — goes to the llm_calls log. */
export interface CallMeta {
  purpose: "chat" | "doc_read_page" | "doc_extract" | "doc_column" | "test";
  officeId?: string | null;
  userId?: string | null;
  threadId?: string | null;
  documentId?: string | null;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number; // includes thinking tokens (billed as output)
}

export interface CallInfo {
  provider: string;
  model: string;
  usage: Usage;
  costUsd: number;
  latencyMs: number;
}

export interface ChatRequest {
  system: string;
  messages: LlmMessage[];
  tools?: ToolSpec[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  meta: CallMeta;
  /** Cancels the request (the chat turn's own time limit). Aborting = LlmUnavailableError. */
  signal?: AbortSignal;
  /** This call's time limit; the provider uses at most its own chat limit (60s). */
  timeoutMs?: number;
}

export interface ChatResponse extends CallInfo {
  text: string;
  toolCalls: LlmToolCall[];
  /** Store on the assistant message (chat_messages.tool_calls.raw) and pass back as LlmMessage.raw. */
  raw: unknown;
}

export interface ReadPageRequest {
  file: LlmImage; // one page: an image, or a one-page PDF
  prompt?: string;
  meta: CallMeta;
}

export interface ReadPageResponse extends CallInfo {
  text: string;
}

export interface JsonRequest {
  system: string;
  prompt: string;
  schema: JsonSchema;
  model?: string;
  maxOutputTokens?: number;
  meta: CallMeta;
}

export interface JsonResponse<T = unknown> extends CallInfo {
  data: T;
}

/** A provider implements the raw calls; ./index.ts adds logging + the spend cap. */
export interface LlmProvider {
  name: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
  /** OCR one page. Implementations handle their own model fallback. */
  readPage(req: ReadPageRequest): Promise<ReadPageResponse>;
  json<T = unknown>(req: JsonRequest): Promise<JsonResponse<T>>;
}

/** The provider could not answer now (402 / 429 / 5xx / timeout / network). Never retried; logged once. */
export class LlmUnavailableError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export class SpendCapError extends Error {
  constructor(spent: number, cap: number) {
    super(`LLM spend cap reached: $${spent.toFixed(4)} of $${cap}`);
    this.name = "SpendCapError";
  }
}
