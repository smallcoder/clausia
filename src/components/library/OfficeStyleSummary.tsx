/**
 * What the app took from the lawyer's Word file («ورق المكتب»), read only: the header, the footer, the font and size, the margins, the paper. Nothing to fill in:
 * to change it he uploads another file. A value the file does not have says so.
 */
import { DateText } from "@/components/ui";
import type { OfficeStyle } from "@/lib/word/office-style";
import { twipsToCm } from "@/lib/word/office-style";

const cm = (t: number | null) => (t === null ? "—" : twipsToCm(t));
/** 28 half-points = 14 pt */
const pt = (half: number) => `${half / 2}`;
const PAPER: [number, number, string][] = [[11906, 16838, "A4"], [8419, 11906, "A5"], [12240, 15840, "Letter"]];
const paper = (w: number | null, h: number | null) => (w && h ? PAPER.find(([pw, ph]) => Math.abs(pw - w) < 30 && Math.abs(ph - h) < 30)?.[2] ?? `${cm(w)} × ${cm(h)} سم` : "—");

export function OfficeStyleSummary({ fileName, updatedAt, style }: { fileName: string; updatedAt: string; style: OfficeStyle }) {
  const rows: [string, React.ReactNode][] = [
    ["الرأس", style.header.lines.length || style.header.picture ? (
      <>{style.header.lines.map((l, i) => <span key={i} className="block">{l}</span>)}{style.header.picture ? <span className="block text-text-3">فيه صورة (شعار) هتفضل في الرأس زي ما هي</span> : null}</>
    ) : <span className="text-text-4">مفيش رأس في الملف ده</span>],
    ["التذييل", style.footer.lines.length || style.footer.picture ? (
      <>{style.footer.lines.map((l, i) => <span key={i} className="block">{l}</span>)}{style.footer.picture ? <span className="block text-text-3">فيه صورة</span> : null}</>
    ) : <span className="text-text-4">مفيش تذييل في الملف ده</span>],
    ["الخط", style.fonts.body ? <>{style.fonts.body}{style.fonts.size ? <span className="text-text-3"> · <span className="font-num">{pt(style.fonts.size)}</span> نقطة</span> : null}</> : <span className="text-text-4">الملف مش محدد خط</span>],
    ["الهوامش", style.margins.top === null ? <span className="text-text-4">الملف مش محدد هوامش</span> : (
      <span className="font-num">
        <bdi>فوق {cm(style.margins.top)}</bdi> · <bdi>تحت {cm(style.margins.bottom)}</bdi> · <bdi>يمين {cm(style.margins.right)}</bdi> · <bdi>شمال {cm(style.margins.left)}</bdi> <span className="font-sans text-text-3">سم</span>
      </span>
    )],
    ["الورقة", <span key="p" className="font-num">{paper(style.page.w, style.page.h)}</span>],
  ];
  return (
    <section className="rounded-xl border border-border-2 bg-card shadow-card" aria-label="اللي اتاخد من الملف">
      <header className="border-b border-border-2 px-5 py-4 sm:px-6">
        <h2 className="text-lg font-bold text-title">اللي اتاخد من ملفك</h2>
        <p className="mt-1 text-sm text-text-3"><bdi>{fileName}</bdi> · اترفع <DateText iso={updatedAt.slice(0, 10)} /></p>
      </header>
      <dl className="divide-y divide-border-2">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-4 px-5 py-3.5 sm:px-6">
            <dt className="text-base text-text-3">{k}</dt>
            <dd className="min-w-0 break-words text-md font-semibold text-text">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
