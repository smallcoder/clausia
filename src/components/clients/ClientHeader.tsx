/**
 * A client's page head (docs/design/ia/IAClient*): the breadcrumb «الموكلين / name», the avatar + name with «موكل من <year>» and the case
 * counts, the buttons «اتصل» (a tel: link; none without a phone) and «+ قضية جديدة له» (it opens a fresh session in this client's chat with a
 * starter sentence: nothing is sent), then the info cells: phone, address, power of attorney, and «الأتعاب» (the agreed fees added up).
 * A value that is not recorded says so, faint, never a guess. The power of attorney is the client's own paper of that type, if saved.
 */
import { ChevronRight, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { DateText } from "@/components/ui";
import { RUNNING, type ClientFile } from "@/lib/clients";
import { formatDmy } from "@/lib/dates";
import { DOC_TYPE } from "@/lib/labels";

/** the first letter of the name, without a title («أ.», «الأستاذ») */
const letter = (name: string) => Array.from(name.replace(/^(أ\.|أ\/|أستاذ|الأستاذ|د\.)\s*/u, "").trim())[0] ?? "؟";

/** «قضية واحدة», «قضيتين», «3 قضايا», «12 قضية» */
const casesWord = (n: number) => (n === 1 ? "قضية واحدة" : n === 2 ? "قضيتين" : `${n} ${n <= 10 ? "قضايا" : "قضية"}`);

const ROUND = "tap glass glass-icon inline-flex size-control-lg shrink-0 items-center justify-center rounded-full";

/**
 * `fees`: the «الأتعاب» cell (the fixed fees added up, «مفتوحة», or null = none set). `actions`: replaces the two default buttons («اتصل», «+ قضية جديدة له»);
 * the accounts tab puts «إيصال استلام» and «+ حركة» there (docs/design/ia/SBAcct*).
 */
export function ClientHeader({ client, fees = null, actions }: { client: ClientFile; fees?: React.ReactNode | null; actions?: React.ReactNode }) {
  const running = client.cases.filter((c) => RUNNING.includes(c.status)).length;
  const since = new Date(client.created_at).getFullYear();
  const n = client.cases.length;
  const counts = n === 0 ? "بلا قضايا" : `${casesWord(n)}${running === 0 ? "" : n === 1 ? " متداولة" : running === n ? "، كلها متداولة" : `، ${running === 1 ? "واحدة" : running} منهم متداولة`}`;
  const sub = `موكل من ${since} · ${counts}`;
  const phone = client.phone?.trim() || null;
  const poa = client.poa ? [client.poa.title || DOC_TYPE.power_of_attorney, client.poa.doc_date ? formatDmy(client.poa.doc_date) : null].filter(Boolean).join(" · ") : null;
  // the cells: the value (null = not recorded) and, for the phone, a number that reads left to right
  const cells: { key: string; label: string; value: React.ReactNode | null }[] = [
    { key: "phone", label: "التليفون", value: phone ? <span className="font-num" dir="ltr">{phone}</span> : null },
    { key: "address", label: "العنوان", value: client.address?.trim() || null },
    { key: "poa", label: "التوكيل", value: poa ? <DateText value={poa} /> : null },
    { key: "fees", label: "الأتعاب", value: fees },
  ];
  const starter = `عايز أفتح قضية جديدة للموكل ${client.name}. `;
  const newCase = `/clients/${client.id}?${new URLSearchParams({ s: "new", q: starter })}`;
  const btn = "tap inline-flex h-control-xl items-center justify-center gap-2 rounded-full px-5 text-base font-bold transition";

  return (
    <header className="leading-[1.35]">
      {/* phone: back */}
      <div className="-mx-0.5 flex items-center pt-3.5 sm:hidden">
        <Link href="/clients" aria-label="رجوع" className={ROUND}><ChevronRight size={20} strokeWidth={2} aria-hidden /></Link>
      </div>

      {/* desktop: back + breadcrumb */}
      <div className="hidden items-center gap-3 px-2 pt-6 sm:flex">
        <Link href="/clients" aria-label="رجوع" className={`${ROUND} sm:size-10`}><ChevronRight size={20} strokeWidth={2.2} aria-hidden /></Link>
        <nav aria-label="المسار" className="min-w-0 flex-1 truncate text-sm text-text-3">
          <Link href="/clients" className="tap hover:text-text hover:underline">الموكلين</Link>
          <span aria-hidden className="mx-1.5 text-text-4">/</span><span className="font-semibold text-text">{client.name}</span>
        </nav>
      </div>

      {/* the avatar and the name, the buttons at the end */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-1 pt-4.5 sm:mt-4 sm:px-2 sm:pt-0">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-selected text-xl font-bold text-gold sm:size-16">{letter(client.name)}</span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-[1.2] text-title sm:text-page-title sm:leading-[1.1]">{client.name}</h1>
            <p className="mt-1.5 text-base text-text-3">{sub}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {actions ?? <>{phone ? (
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={`${btn} border border-border bg-chip text-text-2 hover:text-text`}>
              <Phone aria-hidden size={16} strokeWidth={1.9} />اتصل
            </a>
          ) : null}
          <Link href={newCase} className={`${btn} bg-selected text-on-selected shadow-card hover:opacity-90`}>
            <Plus aria-hidden size={16} strokeWidth={2.2} />قضية جديدة له
          </Link></>}
        </div>
      </div>

      {/* the info cells: 4 across when the column is wide, else 2 × 2 (it follows its own column: the chat sits beside the page) */}
      <div className="@container mt-4.5">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border-2 bg-border-2 shadow-card @3xl:grid-cols-4">
          {cells.map((c) => (
            <div key={c.key} className="min-w-0 bg-card px-3.5 py-3 @3xl:px-5 @3xl:py-3.5">
              <dt className="text-xs text-text-4">{c.label}</dt>
              <dd className={`mt-1 truncate text-base leading-[1.4] @3xl:text-md ${c.value ? "font-semibold text-text" : "text-text-4"}`}>
                {c.value ?? "مش متسجل"}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}
