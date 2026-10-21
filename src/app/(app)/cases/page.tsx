// Cases list: search (?q=) across number, year, title, court, circuit, client and party names; filters for stage and status.
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Badge, Card, DateText, EmptyState, PageHeader, cx } from "@/components/ui";
import { isKey, listCases, type CaseRow } from "@/lib/cases";
import { todayIso } from "@/lib/dates";
import { CASE_STATUS, PARTY_ROLE, STAGE, caseLabel } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

type SP = { q?: string; stage?: string; status?: string };

const STATUS_TONE: Record<CaseRow["status"], "accent" | "brass" | "ok" | "neutral" | "danger"> = {
  active: "accent", reserved_for_judgment: "brass", judged: "ok", suspended: "danger", closed: "neutral",
};

function href(sp: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  const merged = { ...sp, ...patch };
  for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/cases?${s}` : "/cases";
}

function Chip({ active, to, children }: { active: boolean; to: string; children: React.ReactNode }) {
  return (
    <Link href={to} aria-current={active ? "true" : undefined} className={cx("inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-3.5 text-callout transition-colors duration-150",
      active ? "bg-ink font-medium text-paper" : "bg-surface text-ink-2 shadow-1 hover:text-ink")}>
      {children}
    </Link>
  );
}

function NextHearing({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-ink-3">لا جلسة قادمة</span>;
  const today = todayIso();
  const tag = iso === today ? "اليوم" : null;
  return (
    <span className={cx("inline-flex items-center gap-1.5", tag ? "font-medium text-accent" : "text-ink")}>
      <DateText iso={iso} />{tag ? <span className="text-xs">({tag})</span> : null}
    </span>
  );
}

type RawSP = Record<string, string | string[] | undefined>;
/** `?q=a&q=b` arrives as an array: keep the first value. */
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CasesPage({ searchParams }: { searchParams: Promise<RawSP> }) {
  const raw = await searchParams;
  const stage = one(raw.stage), status = one(raw.status);
  // unknown stage/status values are dropped so the chips, hidden inputs and query agree
  const sp: SP = { q: one(raw.q), stage: stage && isKey(STAGE, stage) ? stage : undefined, status: status && isKey(CASE_STATUS, status) ? status : undefined };
  const db = await createClient();
  const rows = await listCases(db, sp);
  const filtered = Boolean(sp.q || sp.stage || sp.status);

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title="القضايا" subtitle={filtered ? `${rows.length} نتيجة` : `${rows.length} قضية في المكتب`} />

      <form action="/cases" className="mb-4 flex gap-2" role="search">
        {sp.stage ? <input type="hidden" name="stage" value={sp.stage} /> : null}
        {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
        <input
          name="q" defaultValue={sp.q ?? ""} type="search"
          placeholder="ابحث برقم الدعوى أو السنة أو المحكمة أو اسم الموكل أو الخصم"
          className="h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] bg-line/70 px-4 text-body text-ink placeholder:text-ink-3 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button className="h-11 rounded-[var(--radius-sm)] bg-accent px-5 text-body font-semibold text-accent-ink transition hover:opacity-90">بحث</button>
      </form>

      <div className="mb-6 space-y-2">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1 after:block after:w-2 after:shrink-0 after:content-[''] lg:mx-0 lg:px-0 lg:after:hidden">
          <Chip active={!sp.stage} to={href(sp, { stage: undefined })}>كل الدرجات</Chip>
          {Object.entries(STAGE).map(([k, v]) => <Chip key={k} active={sp.stage === k} to={href(sp, { stage: k })}>{v}</Chip>)}
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1 after:block after:w-2 after:shrink-0 after:content-[''] lg:mx-0 lg:px-0 lg:after:hidden">
          <Chip active={!sp.status} to={href(sp, { status: undefined })}>كل الحالات</Chip>
          {Object.entries(CASE_STATUS).map(([k, v]) => <Chip key={k} active={sp.status === k} to={href(sp, { status: k })}>{v}</Chip>)}
        </div>
      </div>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState title="لا توجد قضايا مطابقة" hint="جرّب رقم الدعوى وحده، أو جزءًا من اسم الموكل، أو أزل عوامل التصفية."
            action={<Link href="/cases" className="text-sm font-medium text-accent hover:underline">عرض كل القضايا</Link>} />
        ) : (
          <EmptyState title="لا توجد قضايا بعد" hint="اكتب لـ Clausia في المحادثة عن موكل أو دعوى جديدة، وسيقترح إنشاءها لتؤكدها."
            action={<Link href="/chat" className="text-sm font-medium text-accent hover:underline">ابدأ محادثة</Link>} />
        )
      ) : (
        <>
          {/* mobile: cards */}
          <ul className="grouped overflow-hidden rounded-[var(--radius)] bg-surface shadow-1">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/cases/${r.id}`} className="flex min-h-11 items-start gap-3 px-4 py-3.5 transition-colors active:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className="text-body font-semibold text-ink">{caseLabel(r)}</span>
                      <Badge tone={STATUS_TONE[r.status]} className="shrink-0">{CASE_STATUS[r.status]}</Badge>
                    </span>
                    {r.title ? <span className="mt-0.5 block text-callout text-ink-2">{r.title}</span> : null}
                    <span className="mt-1 block text-caption text-ink-3">{[r.court, r.circuit].filter(Boolean).join(" · ") || "المحكمة غير محددة"}</span>
                    <span className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-caption">
                      <span className="text-ink-2">
                        {r.client?.name ?? "بلا موكل"}
                        {r.client_role ? <span className="text-ink-3"> ({PARTY_ROLE[r.client_role]})</span> : null}
                      </span>
                      <span className="text-ink-3">الجلسة القادمة: <NextHearing iso={r.next_hearing} /></span>
                    </span>
                  </span>
                  <ChevronLeft aria-hidden size={18} strokeWidth={1.5} className="mt-1 shrink-0 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>

          {/* desktop: dense rows */}
          <Card className="hidden">
            <table className="w-full text-callout">
              <thead className="text-caption text-ink-3">
                <tr className="text-right">
                  <th className="px-4 pb-2.5 pt-3.5 font-medium">الدعوى</th>
                  <th className="px-4 pb-2.5 pt-3.5 font-medium">المحكمة · الدائرة</th>
                  <th className="px-4 pb-2.5 pt-3.5 font-medium">الموكل وصفته</th>
                  <th className="px-4 pb-2.5 pt-3.5 font-medium">الدرجة</th>
                  <th className="px-4 pb-2.5 pt-3.5 font-medium">الجلسة القادمة</th>
                  <th className="px-4 pb-2.5 pt-3.5 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-hairline align-top transition-colors hover:bg-surface-2">
                    <td className="max-w-[22rem] px-4 py-3">
                      <Link href={`/cases/${r.id}`} className="font-semibold text-ink hover:text-accent">{caseLabel(r)}</Link>
                      {r.title ? <p className="mt-0.5 truncate text-ink-3" title={r.title}>{r.title}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {r.court ?? "—"}
                      {r.circuit ? <p className="text-ink-3">{r.circuit}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {r.client?.name ?? "—"}
                      {r.client_role ? <p className="text-ink-3">{PARTY_ROLE[r.client_role]}</p> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-2">{STAGE[r.stage]}</td>
                    <td className="whitespace-nowrap px-4 py-3"><NextHearing iso={r.next_hearing} /></td>
                    <td className="whitespace-nowrap px-4 py-3"><Badge tone={STATUS_TONE[r.status]}>{CASE_STATUS[r.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
