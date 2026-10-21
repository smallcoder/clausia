// Cases list (docs/design/*Cases.dc.html): hero with real stats, search (?q=) across number, year, title, court,
// circuit, client and party names; chips for status (?status=), «محتاجة مراجعة» (?review=1) and stage (?stage=);
// one row per case; the shared Composer for a new case at the bottom.
import { FolderClosed } from "lucide-react";
import Link from "next/link";
import { CaseListHeader, CaseListRow } from "@/components/caselist/CaseListRow";
import { FilterChips, StageMenu, type ListParams } from "@/components/caselist/FilterChips";
import { SearchField } from "@/components/caselist/SearchField";
import { Composer } from "@/components/shell/Composer";
import { PageHero } from "@/components/shell/PageHero";
import { casesNeedingReview, isKey, listCases, officeCaseCounts, weekHearingsCount, type CaseRow } from "@/lib/cases";
import { todayIso } from "@/lib/dates";
import { CASE_STATUS, STAGE } from "@/lib/labels";
import { createClient, getSession } from "@/lib/supabase/server";

type RawSP = Record<string, string | string[] | undefined>;
/** `?q=a&q=b` arrives as an array: keep the first value. */
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Soonest next hearing first; cases without one keep their order (latest update first). */
function byNextHearing(a: CaseRow, b: CaseRow) {
  if (a.next_hearing && b.next_hearing) return a.next_hearing.localeCompare(b.next_hearing);
  return a.next_hearing ? -1 : b.next_hearing ? 1 : 0;
}

export default async function CasesPage({ searchParams }: { searchParams: Promise<RawSP> }) {
  const raw = await searchParams;
  const stage = one(raw.stage), status = one(raw.status);
  // unknown stage/status/review values are dropped so the chips, hidden inputs and query agree
  const sp: ListParams = {
    q: one(raw.q)?.trim() || undefined,
    stage: stage && isKey(STAGE, stage) ? stage : undefined,
    status: status && isKey(CASE_STATUS, status) ? status : undefined,
    review: one(raw.review) === "1" ? "1" : undefined,
  };
  const db = await createClient();
  const [session, rows, review, counts, week] = await Promise.all([
    getSession(db),
    listCases(db, { q: sp.q, stage: sp.stage, status: sp.status, review: Boolean(sp.review) }),
    casesNeedingReview(db),
    officeCaseCounts(db),
    weekHearingsCount(db),
  ]);
  const { data: office } = session ? await db.from("offices").select("name").eq("id", session.officeId).maybeSingle() : { data: null };
  const filtered = Boolean(sp.q || sp.stage || sp.status || sp.review);
  const today = todayIso();
  const sorted = [...rows].sort(byNextHearing);

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col px-4 pt-2 sm:px-10 sm:pt-4">
      <PageHero
        className="-mx-1.5 sm:mx-0"
        back="/"
        icon={<FolderClosed size={28} strokeWidth={2} aria-hidden />}
        eyebrow={office?.name}
        title="القضايا"
        stats={[
          { value: counts.status.active, label: "قضية متداولة", href: "/cases?status=active" },
          { value: week, label: "جلسات الأسبوع", href: "/hearings?view=week" },
          { value: review.size, label: "محتاجة مراجعة", highlight: true, href: "/cases?review=1" },
        ]}
      />

      <SearchField q={sp.q} keep={{ stage: sp.stage, status: sp.status, review: sp.review }}>
        <StageMenu sp={sp} counts={counts} />
      </SearchField>
      <FilterChips sp={sp} counts={counts} review={review.size} />

      {filtered ? (
        <p className="mt-3 px-1 text-xs text-text-3" aria-live="polite">
          <span className="font-num">{rows.length}</span> {rows.length === 1 ? "قضية" : "قضايا"}
          {sp.q ? <> تطابق «{sp.q}»</> : null}
          {" · "}<Link href="/cases" className="font-semibold text-gold-text hover:underline">مسح البحث والتصفية</Link>
        </p>
      ) : null}

      {sorted.length ? (
        <section className="mt-3 overflow-hidden rounded-[20px] border border-border-2 bg-card shadow-card sm:mt-3.5 sm:rounded-[22px]">
          <CaseListHeader />
          <ul className="px-3.5 md:px-0">
            {sorted.map((r) => <CaseListRow key={r.id} r={r} today={today} needsReview={review.has(r.id)} />)}
          </ul>
        </section>
      ) : (
        <section className="mt-3 rounded-[22px] border border-border-2 bg-card px-6 py-10 text-center shadow-card">
          {filtered ? (
            <>
              <h2 className="text-[17px] font-bold text-text">مفيش قضايا مطابقة</h2>
              <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-7 text-text-3">جرّب رقم الدعوى لوحده، أو جزء من اسم الموكل أو الخصم، أو شيل التصفية.</p>
              <Link href="/cases" className="mt-4 inline-flex h-9 items-center rounded-full border border-border bg-chip px-4 text-[13px] font-semibold text-text shadow-soft">كل القضايا</Link>
            </>
          ) : (
            <>
              <h2 className="text-[17px] font-bold text-text">لسه مفيش قضايا</h2>
              <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-7 text-text-3">احكي لـ Clausia تحت عن الموكل والدعوى، أو ارفع الصحيفة، وهي تجهّز الملف وتستنى تأكيدك.</p>
            </>
          )}
        </section>
      )}

      <div className="min-h-6 flex-1" />
      <div className="mx-auto w-full max-w-[820px]">
        <Composer
          target={{ kind: "new" }}
          placeholder="قضية جديدة؟ احكيها لـ Clausia، أو ارفع الصحيفة وهي تعمل الملف"
          chips={[
            { label: "+ موكل وقضية جديدة", short: "+ قضية جديدة", text: "موكل جديد وعنده قضية: ", ghost: true },
            { label: "قضايا جلستها الأسبوع ده", short: "جلسات الأسبوع", text: "إيه القضايا اللي جلستها الأسبوع ده؟" },
            { label: "قضايا محتاجة مراجعة", short: "محتاجة مراجعة", text: "إيه القضايا اللي محتاجة مراجعة مني؟" },
          ]}
        />
      </div>
    </div>
  );
}
