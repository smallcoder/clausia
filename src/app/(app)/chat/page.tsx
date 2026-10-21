// The conversations with Clausia (v2): page header, one row per conversation (latest first), and the composer for a new one.
import { ChevronLeft, FolderClosed } from "lucide-react";
import Link from "next/link";
import { Composer } from "@/components/shell/Composer";
import { ClausiaSays, PageHero, StatusChip } from "@/components/shell/PageHero";
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
    <div className="mx-auto flex w-full max-w-[1024px] flex-1 flex-col gap-7 px-3.5 pt-2.5 sm:gap-9 sm:px-8 sm:pt-5">
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
        <div className="rounded-[24px] border border-border-2 bg-card px-5 py-6 shadow-card">
          <ClausiaSays size="md">لسه مافيش محادثات. احكي لـ Clausia عن موكل أو قضية من تحت، أو ارفع ورقة.</ClausiaSays>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[24px] border border-border-2 bg-card shadow-card">
          {rows.map(({ t, m, at }) => {
            const c = t.case_id ? caseById.get(t.case_id) : null;
            const preview = m ? `${m.role === "user" ? "أنت: " : ""}${m.content.replace(/\*\*/g, "").replace(/\s+/g, " ").slice(0, 140)}` : "لا رسائل بعد";
            return (
              <li key={t.id} className="not-first:border-t not-first:border-[var(--hairline-v2)]">
                <Link href={`/chat/${t.id}`} className="flex min-h-[68px] items-center gap-3.5 px-4 py-3.5 transition hover:bg-card-2 sm:px-[22px]">
                  {c ? (
                    <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-border-2 bg-card-2 text-text-3"><FolderClosed size={17} strokeWidth={1.9} /></span>
                  ) : (
                    <span aria-hidden className="mark font-num inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] text-[15px] font-extrabold">C</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-title">{c ? caseLabel(c) : t.title || "محادثة عامة"}</span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-text-3">{c?.court ? `${c.court} · ` : ""}{preview}</span>
                  </span>
                  {waiting.has(t.id) ? <span className="hidden sm:inline-flex"><StatusChip tone="warn">فيها بطاقة</StatusChip></span> : null}
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="num font-num text-[12.5px] text-text-4">{formatDmy(cairoDay(at))}</span>
                    {waiting.has(t.id) ? <span role="img" aria-label="فيها بطاقة" className="size-1.5 rounded-full bg-gold sm:hidden" /> : null}
                  </span>
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
