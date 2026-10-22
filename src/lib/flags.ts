/**
 * Feature flags: an env var each, default OFF (anything but "1" is off). Read on the server when a page renders.
 *
 * NEXT_PUBLIC_FEATURE_DOCS_TABLE=1 — the case documents table and «+ عمود جديد» (PR #60).
 *   Ready to turn on once the PR for issues #61 / #65 is merged (a saved custom column can be renamed, its cells edited or
 *   confirmed, and it can be removed after a confirm step). Off: the documents view is the paper grid and the per-document panels as before.
 */
export const docsTableEnabled = (): boolean => process.env.NEXT_PUBLIC_FEATURE_DOCS_TABLE === "1";
