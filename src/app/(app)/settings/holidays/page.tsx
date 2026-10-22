// «إجازات المحاكم» (item 5, behind NEXT_PUBLIC_FEATURE_DEADLINES): the ONE shared list of official holidays that moves an appeal deadline
// (art. 18). Everyone reads it. An office reports a missing holiday; only the admin (app_admins) adds, approves, deletes and decides reports.
// Drafts («محتاج مراجعة») are never used in a computation; a year with no approved holiday makes the card say «راجع الإجازات».
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/shell/PageHero";
import { PageHeader } from "@/components/ui";
import { formatDayLabel } from "@/lib/dates";
import { deadlinesEnabled } from "@/lib/flags";
import { createClient } from "@/lib/supabase/server";
import { addHolidayAction, approveHolidayAction, approveReportAction, deleteHolidayAction, rejectReportAction, reportHolidayAction } from "./actions";
import { HolidayForm } from "./HolidayForm";

const BTN = "tap inline-flex h-8 items-center rounded-full border border-border-2 px-3 text-sm text-text-2 transition hover:text-text";
const BTN_GOLD = "tap inline-flex h-8 items-center rounded-full border border-gold-edge px-3 text-sm font-semibold text-gold transition hover:bg-gold-bg";
const REPORT: Record<string, { tone: "warn" | "good" | "bad"; label: string }> = { pending: { tone: "warn", label: "مستني المراجعة" }, approved: { tone: "good", label: "اتعتمد" }, rejected: { tone: "bad", label: "اترفض" } };

export default async function HolidaysPage() {
  if (!deadlinesEnabled()) notFound();
  const db = await createClient();
  const [{ data: admin }, { data: rows }, { data: reports }] = await Promise.all([
    db.rpc("is_admin"),
    db.from("holidays").select("id, holiday_date, name, status, note").order("holiday_date"),
    db.from("holiday_reports").select("id, holiday_date, name, note, status, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const isAdmin = admin === true;
  const holidays = rows ?? [];
  const years = [...new Set(holidays.map((h) => h.holiday_date.slice(0, 4)))];
  const pending = (reports ?? []).filter((r) => r.status === "pending");

  return (
    <div className="mx-auto w-full max-w-narrow flex-1 px-3.5 pb-10 sm:px-6">
      <PageHeader title="إجازات المحاكم"
        subtitle={isAdmin ? "القايمة دي واحدة لكل المكاتب. المسوّدة (محتاج مراجعة) مش بتتحسب لحد ما تعتمدها." : "الإجازات الرسمية اللي بيتمد بيها ميعاد الطعن (م 18). القايمة واحدة لكل المكاتب، والمسؤول هو اللي بيعتمدها."} />

      <div className="space-y-5">
        {isAdmin && pending.length ? (
          <section aria-label="بلاغات مستنية" className="rounded-xl border border-gold-edge bg-card shadow-card">
            <h2 className="border-b border-border-2 px-6 py-4 text-lg font-bold text-title">بلاغات عن إجازات ناقصة <span className="font-num text-gold">{pending.length}</span></h2>
            <ul>
              {pending.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-6 py-3.5 not-first:border-t not-first:border-border-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-md font-semibold text-text">{r.name} · <span className="num font-num">{formatDayLabel(r.holiday_date)}</span></div>
                    {r.note ? <div className="mt-0.5 text-sm text-text-3">{r.note}</div> : null}
                  </div>
                  <form action={approveReportAction}><input type="hidden" name="id" value={r.id} /><button className={BTN_GOLD}>اعتمد</button></form>
                  <form action={rejectReportAction}><input type="hidden" name="id" value={r.id} /><button className={BTN}>ارفض</button></form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-label="قايمة الإجازات" className="rounded-xl border border-border-2 bg-card shadow-card">
          <h2 className="border-b border-border-2 px-6 py-4 text-lg font-bold text-title">الإجازات الرسمية</h2>
          {years.length ? years.map((y) => {
            const ofYear = holidays.filter((h) => h.holiday_date.startsWith(y));
            const approved = ofYear.filter((h) => h.status === "approved").length;
            return (
              <div key={y} className="not-first:border-t not-first:border-border-2">
                <div className="flex items-center justify-between gap-3 px-6 pt-4 text-sm text-text-3">
                  <span className="font-num text-md font-bold text-text">{y}</span>
                  {approved ? <span>{approved} معتمدة من {ofYear.length}</span> : <span className="font-semibold text-gold">مفيش إجازة معتمدة: المواعيد في السنة دي هتقول «راجع الإجازات»</span>}
                </div>
                <ul className="pb-2">
                  {ofYear.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2.5">
                      <div className="min-w-0 flex-1">
                        <span className="text-base font-semibold text-text">{h.name}</span>
                        <span className="num font-num ms-2.5 text-base text-text-3">{formatDayLabel(h.holiday_date)}</span>
                        {h.note ? <div className="text-sm text-text-4">{h.note}</div> : null}
                      </div>
                      <StatusChip tone={h.status === "approved" ? "good" : "warn"}>{h.status === "approved" ? "معتمدة" : "محتاج مراجعة"}</StatusChip>
                      {isAdmin ? (
                        <>
                          {h.status === "draft" ? <form action={approveHolidayAction}><input type="hidden" name="id" value={h.id} /><button className={BTN_GOLD}>اعتمد</button></form> : null}
                          <form action={deleteHolidayAction}><input type="hidden" name="id" value={h.id} /><button className={BTN} aria-label={`امسح ${h.name}`}>امسح</button></form>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          }) : <p className="px-6 py-5 text-base text-text-3">القايمة فاضية.</p>}
        </section>

        {isAdmin ? (
          <section aria-label="ضيف إجازة" className="rounded-xl border border-border-2 bg-card shadow-card">
            <h2 className="border-b border-border-2 px-6 py-4 text-lg font-bold text-title">ضيف إجازة</h2>
            <HolidayForm action={addHolidayAction} submit="ضيف" hint="بتتعتمد على طول، لأنك المسؤول." />
          </section>
        ) : (
          <section aria-label="بلّغ عن إجازة ناقصة" className="rounded-xl border border-border-2 bg-card shadow-card">
            <h2 className="border-b border-border-2 px-6 py-4 text-lg font-bold text-title">بلّغ عن إجازة ناقصة</h2>
            <HolidayForm action={reportHolidayAction} submit="ابعت البلاغ" hint="لو في إجازة رسمية مش في القايمة، ابعتها وهيراجعها المسؤول. مش هتتحسب لحد ما تتعتمد." />
            {(reports ?? []).length ? (
              <ul className="border-t border-border-2">
                {(reports ?? []).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-6 py-3 not-first:border-t not-first:border-border-2">
                    <span className="min-w-0 flex-1 text-base text-text">{r.name} · <span className="num font-num text-text-3">{formatDayLabel(r.holiday_date)}</span></span>
                    <StatusChip tone={REPORT[r.status].tone}>{REPORT[r.status].label}</StatusChip>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
}
