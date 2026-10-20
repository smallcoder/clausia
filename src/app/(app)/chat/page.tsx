// Chat home: start a general conversation (new client / case) or continue a recent one.
import Link from "next/link";
import { StartChat } from "@/components/chat/StartChat";
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { newThreadAction } from "@/lib/assistant/actions";
import { formatDmy } from "@/lib/dates";
import { caseLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

/** A timestamptz → its Cairo calendar date (yyyy-mm-dd), so a message at 01:00 Cairo shows that day, not the UTC one. */
const cairoDay = (ts: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));

export default async function ChatHome() {
  const db = await createClient();
  const { data: threads } = await db.from("chat_threads").select("id, title, case_id, created_at, updated_at").order("updated_at", { ascending: false }).limit(60);
  const list = threads ?? [];
  const ids = list.map((t) => t.id);
  const caseIds = [...new Set(list.map((t) => t.case_id).filter(Boolean))] as string[];
  // latest visible message of EACH thread (one small indexed query per listed thread; a shared window would
  // let busy threads crowd quiet ones out)
  const [msgs, cases] = await Promise.all([
    Promise.all(ids.map((id) =>
      db.from("chat_messages").select("thread_id, role, content, created_at").eq("thread_id", id).neq("role", "tool").neq("content", "")
        .order("created_at", { ascending: false }).limit(1).maybeSingle().then((r) => r.data))),
    caseIds.length ? db.from("cases").select("id, case_number, case_year, title, court").in("id", caseIds).then((r) => r.data ?? []) : Promise.resolve([]),
  ]);
  const last = new Map<string, { role: string; content: string; created_at: string }>();
  for (const m of msgs) if (m) last.set(m.thread_id, m);
  const caseById = new Map(cases.map((c) => [c.id, c]));

  // by last activity; a case thread with no messages yet is not worth listing
  const rows = list
    .map((t) => ({ t, m: last.get(t.id), at: last.get(t.id)?.created_at ?? t.updated_at ?? t.created_at }))
    .filter((r) => r.m || !r.t.case_id)
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <PageHeader
        title="المساعد"
        subtitle="املأ ملف الدعوى بالمحادثة. كل ما يقترحه المساعد يُعرض عليك للتأكيد قبل الحفظ."
        actions={<form action={newThreadAction}><Button type="submit" variant="secondary">محادثة فارغة</Button></form>}
      />
      <StartChat />
      {rows.length ? <SectionTitle>محادثات سابقة</SectionTitle> : null}
      {rows.length === 0 ? (
        <EmptyState title="لا توجد محادثات بعد" hint="ابدأ محادثة جديدة واكتب ما تعرفه عن موكل أو دعوى." />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {rows.map(({ t, m, at }) => {
              const c = t.case_id ? caseById.get(t.case_id) : null;
              return (
                <li key={t.id}>
                  <Link href={`/chat/${t.id}`} className="flex items-start gap-3 px-4 py-3.5 hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-ink">{c ? caseLabel(c) : t.title || "محادثة عامة"}</span>
                        {c ? <Badge tone="accent">محادثة الدعوى</Badge> : <Badge>عامة</Badge>}
                      </div>
                      {c?.court ? <p className="mt-0.5 truncate text-xs text-ink-3">{c.court}</p> : null}
                      <p className="mt-1 truncate text-sm text-ink-2">
                        {m ? <>{m.role === "user" ? "أنت: " : ""}{m.content.replace(/\*\*/g, "").replace(/\s+/g, " ").slice(0, 140)}</> : <span className="text-ink-3">لا رسائل بعد</span>}
                      </p>
                    </div>
                    <span className="num shrink-0 pt-0.5 text-xs text-ink-3">{formatDmy(cairoDay(at))}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
