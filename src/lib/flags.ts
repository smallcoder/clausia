/**
 * Feature flags: an env var each, default OFF (anything but "1" is off). Read on the server when a page renders.
 *
 * NEXT_PUBLIC_FEATURE_DOCS_TABLE=1 — the case documents table and «+ عمود جديد» (PR #60).
 *   Do NOT turn it on in production until issue #61 is merged: a saved custom column must be editable and removable
 *   (removing one asks for a confirm). Off: the documents view is the paper grid and the per-document panels as before.
 */
export const docsTableEnabled = (): boolean => process.env.NEXT_PUBLIC_FEATURE_DOCS_TABLE === "1";
