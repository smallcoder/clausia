// OWNER: case-pages agent. «الملف»: one scroll — facts, parties, requests/arguments, judgments, then the Clausia slot.
import { FactsTab } from "@/components/case-tabs/FactsTab";
import { JudgmentsTab } from "@/components/case-tabs/JudgmentsTab";
import { PartiesTab } from "@/components/case-tabs/PartiesTab";
import { RequestsArgumentsTab } from "@/components/case-tabs/RequestsArgumentsTab";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[22px] font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function CaseFileView({ caseId }: { caseId: string }) {
  return (
    <div className="space-y-10">
      <Section title="الوقائع"><FactsTab caseId={caseId} /></Section>
      <Section title="الأطراف"><PartiesTab caseId={caseId} /></Section>
      <Section title="الطلبات والدفوع"><RequestsArgumentsTab caseId={caseId} /></Section>
      <Section title="الأحكام"><JudgmentsTab caseId={caseId} /></Section>
      <section className="rounded-[var(--radius)] bg-surface-2 p-5">
        <h2 className="text-[17px] font-semibold text-ink-3">تحليل Clausia</h2>
        <p className="mt-1 text-[13px] text-ink-3">سيكتب Clausia هنا رأيًا قانونيًا أو مذكرة من ملف القضية (قريبًا).</p>
      </section>
      <a href={`/api/cases/${caseId}/case-file?download`} className="inline-flex min-h-11 items-center text-[15px] font-medium text-accent hover:underline">تنزيل ملف القضية (JSON)</a>
    </div>
  );
}
