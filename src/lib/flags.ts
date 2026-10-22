/**
 * Feature flags: an env var each, default OFF (anything but "1" is off). Read on the server when a page renders.
 *
 * NEXT_PUBLIC_FEATURE_DOCS_TABLE=1 — the case documents table and «+ عمود جديد» (PR #60).
 *   Ready to turn on once the PR for issues #61 / #65 is merged (a saved custom column can be renamed, its cells edited or
 *   confirmed, and it can be removed after a confirm step). Off: the documents view is the paper grid and the per-document panels as before.
 *
 * NEXT_PUBLIC_FEATURE_DEADLINES=1 — appeal / cassation deadlines (item 5): after a judgment is saved, a card of the periods computed by code from the
 *   article text in LawMill; «حطهم في الرول» saves them and the reminders show on the Roll; /settings/holidays. A LAWYER MUST CHECK THE RULES
 *   (the periods, art. 213 start, art. 18 holidays, the holiday list) BEFORE THIS IS TURNED ON. Off: nothing new shows and no card is proposed.
 */
export const docsTableEnabled = (): boolean => process.env.NEXT_PUBLIC_FEATURE_DOCS_TABLE === "1";

export const deadlinesEnabled = (): boolean => process.env.NEXT_PUBLIC_FEATURE_DEADLINES === "1";
