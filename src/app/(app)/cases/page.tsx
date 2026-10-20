// Cases list: search (?q=) across number, year, title, court, circuit, client and party names; filters for stage and status.
import Link from "next/link";
import { Badge, Card, DateText, EmptyState, PageHeader, cx } from "@/components/ui";
import { listCases, type CaseRow } from "@/lib/cases";
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
    <Link href={to} className={cx("whitespace-nowrap rounded-full border px-3 py-1 text-sm transition",
      active ? "border-accent/30 bg-accent-soft font-medium text-accent" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}>
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

export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const db = await createClient();
  const rows = await listCases(db, sp);
  const filtered = Boolean(sp.q || sp.stage || sp.status);

  return (
    <>
      <PageHeader title="القضايا" subtitle={filtered ? `${rows.length} نتيجة` : `${rows.length} قضية في المكتب`} />

      <form action="/cases" className="mb-3 flex gap-2" role="search">
        {sp.stage ? <input type="hidden" name="stage" value={sp.stage} /> : null}
        {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
        <input
          name="q" defaultValue={sp.q ?? ""} type="search"
          placeholder="ابحث برقم الدعوى أو السنة أو المحكمة أو اسم الموكل أو الخصم"
          className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3"
        />
        <button className="h-11 rounded-lg bg-accent px-4 text-[15px] font-medium text-accent-ink hover:brightness-110">بحث</button>
      </form>

      <div className="mb-5 space-y-2">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          <Chip active={!sp.stage} to={href(sp, { stage: undefined })}>كل الدرجات</Chip>
          {Object.entries(STAGE).map(([k, v]) => <Chip key={k} active={sp.stage === k} to={href(sp, { stage: k })}>{v}</Chip>)}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          <Chip active={!sp.status} to={href(sp, { status: undefined })}>كل الحالات</Chip>
          {Object.entries(CASE_STATUS).map(([k, v]) => <Chip key={k} active={sp.status === k} to={href(sp, { status: k })}>{v}</Chip>)}
        </div>
      </div>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState title="لا توجد قضايا مطابقة" hint="جرّب رقم الدعوى وحده، أو جزءًا من اسم الموكل، أو أزل عوامل التصفية."
            action={<Link href="/cases" className="text-sm font-medium text-accent hover:underline">عرض كل القضايا</Link>} />
        ) : (
          <EmptyState title="لا توجد قضايا بعد" hint="اكتب للمساعد في المحادثة عن موكل أو دعوى جديدة، وسيقترح إنشاءها لتؤكدها."
            action={<Link href="/chat" className="text-sm font-medium text-accent hover:underline">ابدأ محادثة</Link>} />
        )
      ) : (
        <>
          {/* mobile: cards */}
          <ul className="space-y-3 lg:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/cases/${r.id}`} className="block">
                  <Card className="p-4 transition hover:border-line-strong">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-ink">{caseLabel(r)}</p>
                      <Badge tone={STATUS_TONE[r.status]}>{CASE_STATUS[r.status]}</Badge>
                    </div>
                    {r.title ? <p className="mt-1 text-sm text-ink-2">{r.title}</p> : null}
                    <p className="mt-2 text-sm text-ink-3">{[r.court, r.circuit].filter(Boolean).join(" · ") || "المحكمة غير محددة"}</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
                      <span className="text-ink-2">
                        {r.client?.name ?? "بلا موكل"}
                        {r.client_role ? <span className="text-ink-3"> — {PARTY_ROLE[r.client_role]}</span> : null}
                      </span>
                      <span className="text-ink-3">الجلسة القادمة: <NextHearing iso={r.next_hearing} /></span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          {/* desktop: dense rows */}
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-ink-3">
                <tr className="text-right">
                  <th className="px-4 py-2.5 font-medium">الدعوى</th>
                  <th className="px-4 py-2.5 font-medium">المحكمة · الدائرة</th>
                  <th className="px-4 py-2.5 font-medium">الموكل وصفته</th>
                  <th className="px-4 py-2.5 font-medium">الدرجة</th>
                  <th className="px-4 py-2.5 font-medium">الجلسة القادمة</th>
                  <th className="px-4 py-2.5 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top hover:bg-surface-2/60">
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
    </>
  );
}
