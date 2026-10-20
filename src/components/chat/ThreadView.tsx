import "server-only";
/** Server part of a thread: loads the visible messages, their cards and the names the cards need. */
import { buildProposalLookup } from "@/lib/assistant/lookup";
import type { Proposal } from "@/lib/proposals";
import type { Db } from "@/lib/supabase/server";
import { ChatThread, type ChatItem } from "./ChatThread";

export async function ThreadView({ db, threadId, caseId }: { db: Db; threadId: string; caseId?: string | null }) {
  const [{ data: rows }, { data: props }] = await Promise.all([
    db.from("chat_messages").select("id, role, content, attachments, created_at").eq("thread_id", threadId).neq("role", "tool").order("created_at").limit(400),
    db.from("proposals").select("*").eq("thread_id", threadId).order("created_at"),
  ]);
  const proposals = (props ?? []) as unknown as Proposal[];
  const byMessage = new Map<string, Proposal[]>();
  const orphans: Proposal[] = [];
  for (const p of proposals) {
    if (p.message_id) byMessage.set(p.message_id, [...(byMessage.get(p.message_id) ?? []), p]);
    else orphans.push(p);
  }
  const lookup = await buildProposalLookup(db, proposals);

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

  // The card is made in a tool round with no text; the model's explanation comes in the next round.
  // Show the explanation first, then the card under it.
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i], b = items[i + 1];
    if (a.role === "assistant" && !a.content.trim() && a.proposals.length && b.role === "assistant" && b.content.trim()) {
      b.proposals = [...a.proposals, ...b.proposals];
      a.proposals = [];
    }
  }
  const visible = items.filter((x) => x.role === "user" || x.content.trim() || x.proposals.length);

  return <ChatThread threadId={threadId} caseId={caseId ?? null} items={visible} lookup={lookup} />;
}
