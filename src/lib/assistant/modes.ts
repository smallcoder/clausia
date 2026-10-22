/**
 * The composer's mode tabs (chat-first split layout): ask / rulings / draft / analyze.
 * For now a mode changes only the placeholder and one line of the system prompt (prompt.ts).
 * Shared by the client (tabs, placeholder) and the server (the turn), so no server-only import here.
 */
export const CHAT_MODES = ["ask", "rulings", "draft", "analyze"] as const;
export type ChatMode = (typeof CHAT_MODES)[number];

export const MODE_LABEL: Record<ChatMode, string> = { ask: "اسأل", rulings: "أحكام", draft: "صيغ", analyze: "حلّل" };

/** The input's placeholder: «ask» depends on the context (a case or the general chat). */
export function modePlaceholder(mode: ChatMode, inCase: boolean): string {
  switch (mode) {
    case "rulings": return "اسأل عن حكم أو مبدأ قضائي…";
    case "draft": return "اكتب المطلوب: مذكرة، إنذار، صيغة…";
    case "analyze": return "اطلب تحليل: نقاط القوة والضعف، الثغرات…";
    default: return inCase ? "قول حصل إيه في القضية دي…" : "اسأل أو قول حصل إيه…";
  }
}

/** Anything that is not one of the four becomes «ask» (the value comes from the browser). */
export function parseMode(v: unknown): ChatMode {
  return CHAT_MODES.includes(v as ChatMode) ? (v as ChatMode) : "ask";
}
