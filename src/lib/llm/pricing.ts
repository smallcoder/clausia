/** USD per 1M tokens. Same numbers as lawmill/src/llm-usage.ts (read 2026-09-23). Output includes thinking. */
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-3.5-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3.8-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3.1-pro-preview": { input: 2, output: 12 },
};

export function priceUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? { input: 2, output: 12 }; // unknown model: book the expensive price, never under-count
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
