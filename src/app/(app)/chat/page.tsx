// The conversations with Clausia: hero, one row per conversation (latest first), and the composer for a new one.
import { ChevronLeft, FolderClosed } from "lucide-react";
import Link from "next/link";
import { Composer } from "@/components/shell/Composer";
import { PageHero, StatusChip } from "@/components/shell/PageHero";
import { formatDmy } from "@/lib/dates";
import { caseLabel } from "@/lib/labels";
import type { ProposalOp } from "@/lib/proposals";
import { createClient } from "@/lib/supabase/server";

/** A timestamptz → its Cairo calendar date (yyyy-mm-dd), so a message at 01:00 Cairo shows that day, not the UTC one. */
const cairoDay = (ts: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));

const isOpen = (s: string) => s === "pending" || s === "failed";

export default async function ChatHome() {
  const db = await createClient();
  const { data: threads } = await db.from("chat_threads").select("id, title, case_id, created_at, updated_at").order("updated_at", { ascending: false }).limit(60);
  const list = threads ?? [];
  const ids = list.map((t) => t.id);
  const caseIds = [...new Set(list.map((t) => t.case_id).filter(Boolean))] as string[];
  // latest visible message of EACH thread (one small indexed query per listed thread; a shared window would
  // let busy threads crowd quiet ones out)
  const [msgs, cases, cards, docsRead] = await Promise.all([
    Promise.all(ids.map((id) =>
      db.from("chat_messages").select("thread_id, role, content, created_at").eq("thread_id", id).neq("role", "tool").neq("content", "")
        .order("created_at", { ascending: false }).limit(1).maybeSingle().then((r) => r.data))),
    caseIds.length ? db.from("cases").select("id, case_number, case_year, title, court").in("id", caseIds).then((r) => r.data ?? []) : Promise.resolve([]),
    ids.length ? db.from("proposals").select("thread_id, ops").in("thread_id", ids).in("status", ["pending", "partially_confirmed"]).then((r) => r.data ?? []) : Promise.resolve([]),
    ids.length ? db.from("documents").select("id", { count: "exact", head: true }).in("thread_id", ids).eq("read_status", "done").then((r) => r.count ?? 0) : Promise.resolve(0),
  ]);
  const last = new Map<string, { role: string; content: string; created_at: string }>();
  for (const m of msgs) if (m) last.set(m.thread_id, m);
  const caseById = new Map(cases.map((c) => [c.id, c]));
  // threads with a card that still has items waiting for a decision
  const waiting = new Set<string>();
  for (const p of cards) if (p.thread_id && ((p.ops ?? []) as unknown as ProposalOp[]).some((o) => isOpen(o.status))) waiting.add(p.thread_id);

  // by last activity; a case thread with no messages yet is not worth listing
  const rows = list
    .map((t) => ({ t, m: last.get(t.id), at: last.get(t.id)?.created_at ?? t.updated_at ?? t.created_at }))
    .filter((r) => r.m || !r.t.case_id)
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="mx-auto flex w-full max-w-[1024px] flex-1 flex-col gap-4 px-2.5 pt-2.5 sm:px-8 sm:pt-5">
      <PageHero
        back="/"
        icon={<span className="font-num text-[25px] font-black sm:text-[30px]">C</span>}
        eyebrow="Clausia"
        title="المحادثات"
        stats={[
          { value: rows.length, label: "محادثة" },
          { value: docsRead, label: "ورقة اتقرت" },
          { value: rows.filter((r) => waiting.has(r.t.id)).length, label: "بطاقة مستنياك", highlight: true },
        ]}
      />

      {rows.length === 0 ? (
        <p className="rounded-[22px] border border-border-2 bg-card px-5 py-6 text-center text-[15px] text-text-3 shadow-card">
          لسه مافيش محادثات. احكي لـ Clausia عن موكل أو قضية من تحت، أو ارفع ورقة.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[22px] border border-border-2 bg-card shadow-card">
          {rows.map(({ t, m, at }, i) => {
            const c = t.case_id ? caseById.get(t.case_id) : null;
            const preview = m ? `${m.role === "user" ? "أنت: " : ""}${m.content.replace(/\*\*/g, "").replace(/\s+/g, " ").slice(0, 140)}` : "لا رسائل بعد";
            return (
              <li key={t.id} className={i ? "border-t border-border-2" : undefined}>
                <Link href={`/chat/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-card-2 sm:px-5">
                  {c ? (
                    <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-card-3 text-text-2"><FolderClosed size={17} strokeWidth={2} /></span>
                  ) : (
                    <span aria-hidden className="mark font-num inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-black">C</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-text">{c ? caseLabel(c) : t.title || "محادثة عامة"}</span>
                    <span className="block truncate text-xs text-text-3">{c?.court ? `${c.court} · ` : ""}{preview}</span>
                  </span>
                  {waiting.has(t.id) ? <StatusChip tone="warn">فيها بطاقة</StatusChip> : null}
                  <span className="num font-num shrink-0 text-[13px] font-semibold text-text-3">{formatDmy(cairoDay(at))}</span>
                  <ChevronLeft aria-hidden size={18} strokeWidth={1.8} className="hidden shrink-0 text-text-4 sm:block" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="min-h-6 flex-1" />
      <Composer target={{ kind: "new" }} placeholder="محادثة جديدة؟ احكي لـ Clausia، أو ارفع الصحيفة وهي تعمل الملف" />
    </div>
  );
}
