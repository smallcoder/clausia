// «ورق المكتب» (PR 6b): the office's own paper, taken from ANY Word file the lawyer uploads from his work: the header, the footer, the font and the margins.
// No settings form: one upload. Applied to every new draft, every Word export and the receipt. Replaced later by uploading another file.
// (Until a file is uploaded the page says so; a draft's first «تنزيل Word» asks for it too.)
import { OfficeStyleSummary } from "@/components/library/OfficeStyleSummary";
import { OfficeStyleUpload } from "@/components/library/OfficeStyleUpload";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { loadOfficeStyle } from "@/lib/word/export";

export const metadata = { title: "ورق المكتب" };

export default async function OfficeStylePage() {
  const db = await createClient();
  const s = await loadOfficeStyle(db);
  return (
    <div className="mx-auto w-full max-w-narrow flex-1 px-3.5 pb-10 sm:px-6">
      <PageHeader title="ورق المكتب"
        subtitle="ارفع أي ملف Word من شغلك (مذكرة، خطاب، صحيفة قديمة). Clausia بتاخد منه الرأس والتذييل والخط والهوامش، وتطبقهم على المسودات الجديدة وعلى ملفات Word اللي بتنزّلها وعلى الإيصالات." />
      <div className="space-y-5">
        {s ? <OfficeStyleSummary fileName={s.file_name} updatedAt={s.updated_at} style={s.style} /> : (
          <section className="rounded-xl border border-gold-edge bg-card px-5 py-6 shadow-card sm:px-6">
            <h2 className="text-lg font-bold text-title">ورق مكتبك لسه مش متحدد</h2>
            <p className="mt-1.5 max-w-xl text-base leading-7 text-text-3">لحد ما ترفع ملف، المسودات بتنزل على ورقة بيضاء عادية. مفيش حاجة تكتبها هنا: الملف بس.</p>
          </section>
        )}
        <section className="rounded-xl border border-border-2 bg-card px-5 py-5 shadow-card sm:px-6">
          <h2 className="text-md font-bold text-title">{s ? "استبدل الملف" : "ارفع ملف Word"}</h2>
          <p className="mb-3 mt-1 text-sm leading-6 text-text-3">
            {s ? "الملف الجديد بيحل مكان القديم. المسودات اللي اتنزلت قبل كده مش بتتغير." : "الملف بيتقري بس عشان الرأس والتذييل والخط والهوامش؛ نص المذكرة نفسها مش بيتنقل لأي مسودة."}
          </p>
          <OfficeStyleUpload label={s ? "استبدل بملف Word تاني" : "ارفع ملف Word"} primary={!s} />
        </section>
      </div>
    </div>
  );
}
