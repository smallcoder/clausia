import "server-only";
/** Server part of a session: loads the visible messages, their cards, the thread's papers and the names the cards need. */
import { buildProposalLookup } from "@/lib/assistant/lookup";
import { loadCardRows } from "@/lib/pending-edits";
import type { EditRow } from "@/lib/edits";
import { loadDeadlineCards, type DeadlineCardEntry } from "@/lib/deadlines/cards";
import { DOC_TYPE } from "@/lib/labels";
import type { Proposal } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";
import type { ChatItem, ThreadDoc } from "./ChatThread";

export interface ThreadData {
  items: ChatItem[];
  proposals: Proposal[];
  lookup: Record<string, string>;
  /** «old ← new» lines of the change ops in the cards, by `proposalId:opId` (src/lib/edits.ts) */
  rows: Record<string, EditRow[]>;
  /** the deadlines cards' data by proposal id (empty with the flag off) */
  deadlines: Record<string, DeadlineCardEntry>;
  docs: Record<string, ThreadDoc>;
  stats: {
    /** papers uploaded in this thread whose pages were read (documents.read_status = 'done') */
    docsRead: number;
    /** ops still waiting for a decision (pending or failed) across every card in the thread */
    readyOps: number;
    /**
     * 1 when Clausia's last visible message is a question (ends with «؟» or «?») and the lawyer has not replied
     * after it; otherwise 0. A thread has at most one open question this way.
     */
    openQuestion: number;
  };
}

const isOpen = (s: string) => s === "pending" || s === "failed";

export async function loadThread(db: Db, threadId: string): Promise<ThreadData> {
  const [{ data: rows }, { data: props }, { data: docRows }] = await Promise.all([
    db.from("chat_messages").select("id, role, content, attachments, created_at").eq("thread_id", threadId).neq("role", "tool").order("created_at").limit(400),
    db.from("proposals").select("*").eq("thread_id", threadId).order("created_at"),
    db.from("documents").select("id, file_name, title, doc_type, page_count, read_status, mime_type").eq("thread_id", threadId),
  ]);
  const proposals = (props ?? []) as unknown as Proposal[];
  const byMessage = new Map<string, Proposal[]>();
  const orphans: Proposal[] = [];
  for (const p of proposals) {
    if (p.message_id) byMessage.set(p.message_id, [...(byMessage.get(p.message_id) ?? []), p]);
    else orphans.push(p);
  }
  const lookup = await buildProposalLookup(db, proposals);
  const deadlines = await loadDeadlineCards(db, proposals);
  const editRows = await loadCardRows(db, proposals);

  const docs: Record<string, ThreadDoc> = {};
  for (const d of docRows ?? []) {
    docs[d.id] = { name: d.file_name, pages: d.page_count, status: d.read_status, image: d.mime_type.startsWith("image/") };
    // the card's source column reads «صحيفة دعوى ص 2» rather than the file name when the paper's type is known
    if (d.doc_type && d.doc_type !== "other") lookup[d.id] = DOC_TYPE[d.doc_type];
  }

  const items: ChatItem[] = [];
  for (const r of rows ?? []) {
    const cards = byMessage.get(r.id) ?? [];
    if (r.role === "assistant" && !r.content.trim() && !cards.length) continue; // tool-only rounds
    const att = Array.isArray(r.attachments) ? (r.attachments as { document_id?: string; file_name?: string }[]) : [];
    items.push({
      id: r.id, role: r.role === "user" ? "user" : "assistant", content: r.content, createdAt: r.created_at,
      attachments: att.map((a) => ({ documentId: a.document_id ?? "", fileName: a.file_name ?? "مستند" })),
      proposals: cards,
    });
  }
  for (const p of orphans) items.push({ id: `p-${p.id}`, role: "assistant", content: "", createdAt: p.created_at, attachments: [], proposals: [p] });
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Cards are made in tool rounds with no text; the model's explanation comes in a later round of the same turn.
  // Show the explanation first, then every card of that turn under it, in order.
  let carry: { from: ChatItem; cards: Proposal[] }[] = [];
  for (const it of items) {
    if (it.role === "assistant" && !it.content.trim() && it.proposals.length) {
      carry.push({ from: it, cards: it.proposals });
      it.proposals = [];
    } else if (it.role === "assistant" && it.content.trim()) {
      it.proposals = [...carry.flatMap((c) => c.cards), ...it.proposals];
      carry = [];
    } else if (it.role === "user") {
      for (const c of carry) c.from.proposals = c.cards; // no text in that turn: the cards stay where they were
      carry = [];
    }
  }
  for (const c of carry) c.from.proposals = c.cards;
  const visible = items.filter((x) => x.role === "user" || x.content.trim() || x.proposals.length);

  const lastSpoken = [...visible].reverse().find((x) => x.role === "user" || x.content.trim());
  const openQuestion = lastSpoken?.role === "assistant" && /[؟?]$/.test(lastSpoken.content.replace(/[\s*»")]+$/u, "")) ? 1 : 0;

  return {
    items: visible,
    proposals,
    lookup,
    rows: editRows,
    deadlines,
    docs,
    stats: {
      docsRead: (docRows ?? []).filter((d) => d.read_status === "done").length,
      readyOps: proposals.reduce((n, p) => n + p.ops.filter((o) => isOpen(o.status)).length, 0),
      openQuestion,
    },
  };
}
