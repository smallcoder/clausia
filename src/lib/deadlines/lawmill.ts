import "server-only";
/**
 * LawMill (read only): the verbatim text of one article of قانون المرافعات 13/1968, the version in force on a given day.
 * A plain HTTPS POST to the RPC `retrieve_ready_corpus_article_citation` with the project's PUBLISHABLE key (server only; there is
 * no service key here and nothing is ever written to LawMill).
 *
 * Cache: in memory with a TTL (the LawMill project has a data-transfer limit; an article text does not change for a given
 * article + day). A text is only a few hundred bytes, so a table was not needed; and a shared table of article texts that
 * every office could write would let one office poison the others. The saved deadline keeps its own verbatim copy of the text.
 */
import { createHash } from "node:crypto";
import { normalizeDigits } from "@/lib/dates";

export const PROCEDURE_LAW = { sourceId: "0c84df2b-9239-41b2-a801-8eb176c90985", label: "مرافعات", name: "قانون المرافعات المدنية والتجارية 13/1968" } as const;

export interface Article {
  article_number: string;
  source_label: string;
  title_ar: string;
  version_id: string;
  text_ar: string;
  text_sha256: string;
}
/** `missing`: LawMill has no ready text for that article / day (e.g. art. 18 today); `unreachable`: it did not answer. */
export type ArticleResult = { ok: true; article: Article } | { ok: false; reason: "missing" | "unreachable" };

const TTL_OK_MS = 6 * 60 * 60_000;
const TTL_MISSING_MS = 10 * 60_000;
const TIMEOUT_MS = 8_000;

type Fetcher = (articleNumber: string, asOf: string) => Promise<ArticleResult>;
const cache = new Map<string, { at: number; ttl: number; value: ArticleResult }>();
let fetcher: Fetcher | null = null;

/** Tests give their own source of texts (the saved fixture) so no network is used; pass null to go back to LawMill. */
export function setArticleFetcher(f: Fetcher | null) {
  fetcher = f;
  cache.clear();
}

async function fromLawMill(articleNumber: string, asOf: string): Promise<ArticleResult> {
  const base = process.env.LAWMILL_SUPABASE_URL;
  const key = process.env.LAWMILL_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return { ok: false, reason: "unreachable" };
  try {
    const r = await fetch(`${base}/rest/v1/rpc/retrieve_ready_corpus_article_citation`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_source_id: PROCEDURE_LAW.sourceId, p_article_number: articleNumber, p_as_of: asOf }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!r.ok) return { ok: false, reason: "unreachable" };
    const rows = (await r.json()) as unknown;
    if (!Array.isArray(rows)) return { ok: false, reason: "unreachable" };
    const row = rows.find((x) => x && typeof x === "object" && normalizeDigits(String((x as { article_number?: unknown }).article_number ?? "")).trim() === articleNumber) as Record<string, unknown> | undefined;
    const text = row && typeof row.text_ar === "string" ? row.text_ar : "";
    const version = row && typeof row.version_id === "string" ? row.version_id : "";
    if (!row || !text.trim() || !version || (row.readiness_reason !== undefined && row.readiness_reason !== "READY")) return { ok: false, reason: "missing" };
    return {
      ok: true,
      article: {
        article_number: articleNumber,
        source_label: String(row.source_label ?? "13/1968"),
        title_ar: String(row.title_ar ?? PROCEDURE_LAW.name),
        version_id: version,
        text_ar: text,
        // the hash is of the text we hold, computed here when LawMill did not send one
        text_sha256: typeof row.text_sha256 === "string" && row.text_sha256 ? row.text_sha256 : createHash("sha256").update(text).digest("hex"),
      },
    };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** The article's text in force on `asOf` (the judgment date, yyyy-mm-dd). */
export async function getArticle(articleNumber: string, asOf: string): Promise<ArticleResult> {
  const k = `${articleNumber}:${asOf}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;
  const value = await (fetcher ?? fromLawMill)(articleNumber, asOf);
  // an answer that did not come (timeout, 5xx) is not remembered: the next card asks again
  if (value.ok || value.reason === "missing") cache.set(k, { at: Date.now(), ttl: value.ok ? TTL_OK_MS : TTL_MISSING_MS, value });
  return value;
}
