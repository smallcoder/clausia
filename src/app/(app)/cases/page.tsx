// Cases list (docs/design/*Cases.dc.html, design v2): header with real stats, status capsules (?status=, ?review=1;
// ?stage= and ?q= keep working as links and show as clearable pills), one solid table of cases, and the shared
// Composer at the bottom: there is no search bar, the composer searches, asks and adds a case.
import Link from "next/link";
import { CaseListHeader, CaseListRow } from "@/components/caselist/CaseListRow";
import { FilterChips, type ListParams } from "@/components/caselist/FilterChips";
import { Composer } from "@/components/shell/Composer";
import { PageHero } from "@/components/shell/PageHero";
import { casesNeedingDecision, casesNeedingReview, isKey, judgedAgainstUs, listCases, officeCaseCounts, weekHearingsCount, type CaseRow } from "@/lib/cases";
import { todayIso } from "@/lib/dates";
import { CASE_STATUS, STAGE } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

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
  // unknown stage/status/review values are dropped so the capsules and the query agree
  const sp: ListParams = {
    q: one(raw.q)?.trim() || undefined,
    stage: stage && isKey(STAGE, stage) ? stage : undefined,
    status: status && isKey(CASE_STATUS, status) ? status : undefined,
    review: one(raw.review) === "1" ? "1" : undefined,
  };
  const db = await createClient();
  const [rows, review, decision, counts, week] = await Promise.all([
    listCases(db, { q: sp.q, stage: sp.stage, status: sp.status, review: Boolean(sp.review) }),
    casesNeedingReview(db),
    casesNeedingDecision(db),
    officeCaseCounts(db),
    weekHearingsCount(db),
  ]);
  const against = await judgedAgainstUs(db, rows.filter((r) => r.status === "judged" || r.status === "closed").map((r) => r.id));
  const filtered = Boolean(sp.q || sp.stage || sp.status || sp.review);
  const today = todayIso();
  const sorted = [...rows].sort(byNextHearing);

  return (
    <div className="mx-auto flex w-full max-w-[1424px] flex-1 flex-col px-4 sm:px-8">
      <PageHero
        className="px-1 sm:px-2"
        eyebrow="كل قضايا المكتب"
        title="القضايا"
        stats={[
          { value: counts.total, label: "قضية عندك", href: "/cases" },
          { value: week, label: "جلسات الأسبوع", href: "/hearings?view=week" },
          { value: review.size, label: "محتاجة مراجعة", highlight: true, href: "/cases?review=1" },
        ]}
      />

      <FilterChips sp={sp} counts={counts} review={review.size} />

      {filtered ? (
        <p className="mt-1 px-1 text-xs text-text-3 sm:mt-2" aria-live="polite">
          <span className="font-num">{rows.length}</span> {rows.length === 1 ? "قضية" : "قضايا"}
          {sp.q ? <> تطابق «{sp.q}»</> : null}
          {" · "}<Link href="/cases" className="font-semibold text-text underline-offset-2 hover:underline">مسح التصفية</Link>
        </p>
      ) : null}

      {sorted.length ? (
        <section aria-label="القضايا" className="mt-2.5 overflow-hidden rounded-[24px] border border-border-2 bg-card px-[18px] shadow-card sm:mt-3.5 sm:rounded-[28px] md:px-0">
          <CaseListHeader />
          <ul>
            {sorted.map((r) => (
              <CaseListRow key={r.id} r={r} today={today}
                flags={{ decision: decision.has(r.id), review: review.has(r.id), againstUs: against.has(r.id) }} />
            ))}
          </ul>
        </section>
      ) : (
        <section className="mt-2.5 rounded-[24px] border border-border-2 bg-card px-6 py-12 text-center shadow-card sm:mt-3.5 sm:rounded-[28px]">
          {filtered ? (
            <>
              <h2 className="text-[17px] font-bold text-title">مفيش قضايا مطابقة</h2>
              <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-7 text-text-3">جرّب رقم الدعوى لوحده، أو جزء من اسم الموكل أو الخصم، أو شيل التصفية. أو اسأل Clausia تحت.</p>
              <Link href="/cases" className="mt-4 inline-flex h-11 items-center rounded-full border border-border px-5 text-[13.5px] font-semibold text-text hover:bg-card-2">كل القضايا</Link>
            </>
          ) : (
            <>
              <h2 className="text-[17px] font-bold text-title">لسه مفيش قضايا</h2>
              <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-7 text-text-3">احكي لـ Clausia تحت عن الموكل والدعوى، أو ارفع الصحيفة، وهي تجهّز الملف وتستنى تأكيدك.</p>
            </>
          )}
        </section>
      )}

      <div className="min-h-6 flex-1" />
      <Composer
        target={{ kind: "new" }}
        placeholder="دوّر على قضية، اسأل Clausia، أو احكيلها عن قضية جديدة…"
        placeholderShort="دوّر، اسأل، أو ضيف قضية…"
        chips={[
          { label: "قضية جديدة", icon: "plus", text: "موكل جديد وعنده قضية: " },
          { label: "دوّر على قضية", icon: "search", text: "دوّر لي على قضية " },
          { label: "قضايا جلستها الأسبوع ده", short: "جلسات الأسبوع", icon: "calendar", text: "إيه القضايا اللي جلستها الأسبوع ده؟" },
        ]}
      />
    </div>
  );
}
