/**
 * The model is not reachable right now (owner decision 2026-10-21): no credit (402), rate limit (429), a server error
 * (5xx), a timeout or no network. Clausia says so once, in the chat, as its own notice — no silent hang, no retry loop.
 * Plain module (no "server-only"): the chat UI imports the text to draw the notice.
 */
export const UNAVAILABLE_TEXT = "Clausia مش متاحة دلوقتي، جرّب كمان شوية";

/** HTTP statuses that mean "not available now", not "bad request". */
export const isUnavailableStatus = (status: number) => status === 402 || status === 429 || status >= 500;
