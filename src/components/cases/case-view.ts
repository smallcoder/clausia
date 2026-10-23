/**
 * Pure helpers for the case page (docs/design/*Case.dc.html). Everything here is derived from real case data —
 * no guessing: a missing value gives a shorter sentence, never an invented one.
 */
import type { CiteSource } from "@/components/cite/context";
import type { CaseFile, Provenance } from "@/lib/case-file";
import { formatDmy, type DatePrecision } from "@/lib/dates";
import { DECISION, DOC_TYPE, PARTY_ROLE, STAGE, caseLabel } from "@/lib/labels";

type Party = CaseFile["parties"][number];
type Hearing = CaseFile["hearings"][number];
type Doc = CaseFile["documents"][number];

export const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** «1/9/2022», «يناير 2026», «2026», or «غير محدد». */
export function factDate(iso: string | null, precision: string): string {
  if (!iso || precision === "unknown") return "غير محدد";
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  if (precision === "month") return `${MONTHS[m - 1]} ${y}`;
  return formatDmy(iso, precision as DatePrecision);
}

/** «5/11» */
export const shortDmy = (iso: string) => formatDmy(iso).split("/").slice(0, 2).join("/");

export function daysBetween(fromIso: string, toIso: string): number {
  const [a, b] = [fromIso, toIso].map((s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / 86_400_000);
}

/** Arabic count words: 3–10 take the plural, 11+ the singular. */
function count(n: number, one: string, two: string, few: string, many: string) {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${n <= 10 ? few : many}`;
}

/** «النهارده», «بكرة», «بعد يومين», «بعد 5 أيام», «بعد 16 يوم» */
export function untilLabel(n: number): string {
  if (n <= 0) return "النهارده";
  if (n === 1) return "بكرة";
  return `بعد ${count(n, "يوم", "يومين", "أيام", "يوم")}`;
}

/** «امبارح», «من يومين», «من 5 أيام» */
export function agoLabel(n: number): string {
  if (n <= 0) return "النهارده";
  if (n === 1) return "امبارح";
  return `من ${count(n, "يوم", "يومين", "أيام", "يوم")}`;
}

/** Two letters, no space: «عادل النموذجي» → «عن», «أ. سامح الافتراضي» → «سا». */
export function initials(name: string): string {
  const w = name.replace(/^(أ\.|أ\/|أستاذ|الأستاذ|د\.)\s*/u, "").trim().split(/\s+/).filter(Boolean);
  if (w.length > 1) return w[0][0] + w[1].replace(/^ال(?=.)/u, "")[0];
  return (w[0] ?? "؟").slice(0, 2);
}

const SIDE_A = new Set(["plaintiff", "appellant", "cassation_appellant"]);
const SIDE_B = new Set(["defendant", "appellee", "cassation_appellee"]);
const sideOf = (role: string) => (SIDE_A.has(role) ? "A" : SIDE_B.has(role) ? "B" : null);

export interface PartyRow { id: string | null; name: string; role: string; ours: boolean; suggested: boolean; party?: Party }

/** Parties with role lines («موكلنا · مدعٍ», «خصم · مدعى عليه») plus «محامي الخصم» rows from `representative`. */
export function partyRows(parties: Party[], suggested: Party[]): PartyRow[] {
  const client = parties.find((p) => p.is_our_client);
  const ourSide = client ? sideOf(client.role) : null;
  const out: PartyRow[] = [];
  for (const p of [...parties, ...suggested]) {
    const role = PARTY_ROLE[p.role as keyof typeof PARTY_ROLE] ?? p.role;
    const side = sideOf(p.role);
    const opponent = !p.is_our_client && side !== null && ourSide !== null && side !== ourSide;
    const line = p.is_our_client ? `موكلنا · ${role}` : opponent ? `الخصم · ${role}` : role;
    out.push({ id: p.id, name: p.name, role: line, ours: p.is_our_client, suggested: p.review_status === "suggested", party: p });
    if (p.representative && !p.is_our_client) {
      out.push({ id: null, name: p.representative, role: opponent ? "محامي الخصم" : `يمثل ${p.name}`, ours: false, suggested: false });
    }
  }
  return out;
}

/** Hero title «<our client> ضد <opponent>», falling back to the case title / label. */
export function heroTitle(cf: CaseFile): string {
  const client = cf.parties.find((p) => p.is_our_client);
  const ourName = client?.name ?? cf.client?.name ?? null;
  const ourSide = client ? sideOf(client.role) : null;
  const opp = cf.parties.find((p) => !p.is_our_client && sideOf(p.role) !== null && (ourSide === null || sideOf(p.role) !== ourSide));
  if (ourName && opp) return `${ourName} ضد ${opp.name}`;
  return cf.case.title || cf.case.label;
}

/** The case subject without a trailing «— A ضد B» that repeats the hero title. */
export function heroSubject(cf: CaseFile, title: string): string | null {
  const t = cf.case.title?.trim();
  if (!t || t === title) return null;
  const parts = t.split(/\s+[—–]\s+/);
  if (parts.length > 1 && parts.at(-1) === title) return parts.slice(0, -1).join(" — ");
  return t;
}

/** «إيجارات · أول درجة · 772 لسنة 2025» */
export function heroEyebrow(cf: CaseFile): string {
  const c = cf.case;
  const num = c.case_number ? (c.case_year ? `${c.case_number} لسنة ${c.case_year}` : c.case_number) : null;
  return [c.case_type, STAGE[c.stage], num ?? (c.title ? null : caseLabel(c))].filter(Boolean).join(" · ");
}

/** Who first: our client (big) and the opponent («ضد …»). `fallback` is the case title / label when no client is known. */
export function whoLine(cf: CaseFile): { client: string | null; opponent: string | null; fallback: string } {
  const client = cf.parties.find((p) => p.is_our_client);
  const ourName = client?.name ?? cf.client?.name ?? null;
  const ourSide = client ? sideOf(client.role) : null;
  const opp = cf.parties.find((p) => !p.is_our_client && sideOf(p.role) !== null && (ourSide === null || sideOf(p.role) !== ourSide));
  return { client: ourName, opponent: opp?.name ?? null, fallback: cf.case.title || cf.case.label };
}

/** The spec sheet under the name: number, court, circuit (+ stage), type. Values verbatim; null = not recorded. */
/**
 * The header's spec sheet. `mobile` is the value as the mobile mockup writes it («772 / 2025»); the circuit drops a
 * leading «الدائرة» because its label already says it (mockups: «3 إيجارات · أول درجة»).
 */
/** `clip`: one line with «…» on mobile (long court / case-type names). */
export function specSheet(cf: CaseFile): { label: string; short: string; value: string | null; mobile?: string; extra?: string; fem?: boolean; clip?: boolean }[] {
  const c = cf.case;
  const subject = heroSubject(cf, heroTitle(cf));
  const circuit = c.circuit?.replace(/^الدائرة\s+(?=\S)/u, "") ?? null;
  return [
    { label: "رقم الدعوى", short: "رقم الدعوى", value: c.case_number ? (c.case_year ? `${c.case_number} لسنة ${c.case_year}` : c.case_number) : null,
      mobile: c.case_number && c.case_year ? `${c.case_number} / ${c.case_year}` : undefined },
    { label: "المحكمة", short: "المحكمة", value: c.court, fem: true, clip: true },
    { label: "الدائرة", short: "الدائرة", value: circuit, extra: STAGE[c.stage], fem: true },
    { label: "نوع الدعوى", short: "النوع", value: subject ?? c.case_type, clip: true },
  ];
}

export function docName(d: Pick<Doc, "title" | "doc_type" | "file_name">): string {
  return d.title || DOC_TYPE[d.doc_type as keyof typeof DOC_TYPE] || d.file_name;
}

/** «الصحيفة · ص 2», «من رسالتك», «إدخال يدوي» */
export function sourceText(src: Provenance["source"], docs: Doc[]): string {
  if (src.kind === "document") {
    const d = docs.find((x) => x.id === src.document_id);
    const name = d ? docName(d) : "مستند";
    return src.page ? `${name} · ص ${src.page}` : name;
  }
  if (src.kind === "chat") return "من رسالتك";
  return "إدخال يدوي";
}

/**
 * What a paper source chip needs to open the panel on the sentence: null unless the item came from a paper.
 * `id` is unique per item; `about` names the item (the panel's footer line).
 */
export function citeOf(id: string, src: Provenance["source"], docs: Doc[], about: string | null): CiteSource | null {
  if (src.kind !== "document" || !src.document_id) return null;
  return { id, documentId: src.document_id, page: src.page ?? 1, start: src.char_start, end: src.char_end, quote: src.quote, label: sourceText(src, docs), about };
}

/** a short «kind · text» for the panel's footer */
export function aboutItem(kind: string, text: string, max = 60): string {
  const t = text.replace(/\s+/g, " ").trim();
  return `${kind} · ${t.length > max ? `${t.slice(0, max)}…` : t}`;
}

export function statusTone(s: string): "good" | "warn" | "neutral" {
  if (s === "active") return "good";
  if (s === "reserved_for_judgment" || s === "suspended") return "warn";
  return "neutral";
}

export interface HearingState {
  /** first hearing today or later */
  next: Hearing | null;
  /** what is needed for `next`: the previous decision's requirements, else its purpose */
  nextNeeded: string | null;
  /** the latest hearing before today without a recorded decision */
  undecided: Hearing | null;
  undecidedNeeded: string | null;
}

export function hearingState(hearings: Hearing[], today: string): HearingState {
  const needed = (h: Hearing | null) => (h ? hearings.find((p) => p.next_hearing_id === h.id)?.next_requirements || h.purpose || null : null);
  const next = hearings.find((h) => h.date >= today) ?? null;
  const undecided = hearings.filter((h) => h.date < today && !h.decision_type).at(-1) ?? null;
  return { next, nextNeeded: needed(next), undecided, undecidedNeeded: needed(undecided) };
}

/** A piece of the summary line; `gold` marks the part that needs the lawyer's action. */
export type Seg = { text: string; gold?: boolean };

/**
 * The templated «ملخص Clausia» line (no LLM), Egyptian Arabic: the case summary as recorded, then the hearings
 * (an undecided one first), then what awaits review (gold), then an appeal deadline if one was stated.
 * The facts date is not repeated here: the Facts panel shows it.
 */
export function summarySegments(cf: CaseFile, hs: HearingState, today: string): Seg[] {
  const out: Seg[] = [];
  const say = (text: string, gold = false) => out.push({ text, gold });
  const summary = cf.case.summary?.trim();
  if (summary) say(`${/[.!؟]$/u.test(summary) ? summary : `${summary}.`} `);

  if (hs.undecided) {
    say(`جلسة ${shortDmy(hs.undecided.date)} عدّت (${agoLabel(daysBetween(hs.undecided.date, today))}) `);
    say("ولسه قرارها ما اتسجلش", true);
    say(`${hs.undecidedNeeded ? `، وكان المطلوب فيها: ${hs.undecidedNeeded}` : ""}. `);
  }
  if (hs.next) {
    const n = daysBetween(today, hs.next.date);
    const when = n <= 0 ? `فيه جلسة النهارده ${shortDmy(hs.next.date)}` : `الجلسة الجاية ${shortDmy(hs.next.date)} (${untilLabel(n)})`;
    say(`${when}${hs.nextNeeded ? ` والمطلوب: ${hs.nextNeeded}` : ""}. `);
  } else if (!hs.undecided) {
    say("مفيش جلسة جاية متسجلة. ");
  }

  const p = cf.pending_suggestions;
  if (p.length) {
    const facts = p.every((x) => x.table === "case_facts");
    const what = facts ? count(p.length, "واقعة واحدة", "واقعتين", "وقائع", "واقعة") : count(p.length, "حاجة واحدة", "حاجتين", "حاجات", "حاجة");
    say("فيه ");
    say(`${what} لسه ${p.length === 2 ? "مقترحين" : "مقترحة"}`, true);
    say(`، ${p.length === 1 ? "محتاجة" : "محتاجين"} مراجعتك. `);
  } else if (!hs.undecided) {
    say("ومفيش حاجة مستنية مراجعتك. ");
  }

  const appeal = cf.judgments.filter((j) => j.appeal_deadline && j.appeal_deadline >= today).sort((a, b) => a.appeal_deadline!.localeCompare(b.appeal_deadline!))[0];
  if (appeal?.appeal_deadline) say(`آخر ميعاد للطعن ${formatDmy(appeal.appeal_deadline)}، كما ذكره المحامي.`);
  const last = out.at(-1);
  if (last) last.text = last.text.trimEnd();
  return out;
}

/** The banner's gold words: «واقعة مقترحة», «3 وقائع مقترحة», «حاجتين مقترحين». */
export function pendingWords(cf: CaseFile): string | null {
  const p = cf.pending_suggestions;
  if (!p.length) return null;
  const facts = p.every((x) => x.table === "case_facts");
  if (p.length === 1) return facts ? "واقعة مقترحة" : "حاجة مقترحة";
  if (p.length === 2) return facts ? "واقعتين مقترحين" : "حاجتين مقترحين";
  return `${p.length} ${facts ? (p.length <= 10 ? "وقائع" : "واقعة") : (p.length <= 10 ? "حاجات" : "حاجة")} مقترحة`;
}

/** Egyptian read state for the document rows. */
export const READ_SHORT: Record<string, string> = { pending: "مستنية القراءة", reading: "بتتقري", done: "اتقرت", failed: "ما اتقرتش" };


/** Where a suggested item is shown: the case tab that holds it (`?tab=` is in the link, the sheet opens from the `#item-` hash). */
export function pendingHref(cf: CaseFile): string | undefined {
  const first = cf.pending_suggestions[0];
  if (!first) return undefined;
  if (first.table === "hearings") return `?tab=hearings#h-${first.id}`;
  // judgments sit with the memos (the dossier's last tab)
  if (first.table === "judgments") return `?tab=memos#item-${first.id}`;
  if (first.table === "case_requests" || first.table === "case_arguments") return `?tab=sides#item-${first.id}`;
  return `?tab=facts#item-${first.id}`; // facts and parties
}

// ---------- the dossier header: 8 cells ----------

export interface HeaderCell {
  key: string;
  label: string;
  /** null = not recorded (the cell says so, in the faint colour); never a guess */
  value: string | null;
  extra?: string;
  /** feminine label: «مش متسجلة» */
  fem?: boolean;
  /** one line with «…», the full text in the tooltip */
  clip?: boolean;
  /** gold text (the next hearing) */
  gold?: boolean;
  /** an ISO day: the value is that date (shown through DateText) */
  iso?: string;
}

/** The party that is our opponent (the first one on the other side), as `whoLine` picks it. */
export function opponentParty(cf: CaseFile): Party | null {
  const client = cf.parties.find((p) => p.is_our_client);
  // no party is marked as our client: which side is the other one is not known, so no party is called the opponent (never a guess)
  const ourSide = client ? sideOf(client.role) : null;
  if (!client || ourSide === null) return null;
  return cf.parties.find((p) => !p.is_our_client && sideOf(p.role) !== null && sideOf(p.role) !== ourSide) ?? null;
}

/**
 * A recorded decision as one line, the way the mockup writes it («تأجيل لأصل العقد»): the kind of decision, then its text.
 * The text is the lawyer's own words and is never changed: «للمستندات» after «تأجيل» reads as one phrase; a text that already says
 * the kind («حجز الدعوى للحكم») stands alone; any other text follows the kind after « · ». No text: the kind alone.
 */
export function decisionLine(type: string, text: string | null | undefined): string {
  const kind = DECISION[type as keyof typeof DECISION] ?? type;
  const t = text?.trim();
  if (!t) return kind;
  if (t.includes(kind.split(" ")[0])) return t;
  return /^ل/u.test(t) ? `${kind} ${t}` : `${kind} · ${t}`;
}

/** The latest hearing (today or before) with a recorded decision, and its line. */
export function lastDecision(cf: CaseFile, today: string): { hearing: Hearing; text: string } | null {
  const h = cf.hearings.filter((x) => x.date <= today && x.decision_type).at(-1);
  if (!h) return null;
  return { hearing: h, text: decisionLine(h.decision_type as string, h.decision_text) };
}

/** The case's subject, for the page title: the case title without a leading «<client> — », else the type, else the label. */
export function caseSubject(cf: CaseFile): string {
  const c = cf.case;
  const t = c.title?.trim();
  if (t) {
    const client = whoLine(cf).client;
    const parts = t.split(/\s+[—–]\s+/);
    if (parts.length > 1 && client && parts[0] === client) return parts.slice(1).join(" — ");
    return heroSubject(cf, heroTitle(cf)) ?? t;
  }
  return c.case_type ?? c.label;
}

/**
 * The 8 cells of the dossier header, in the owner's order: number, court, circuit, next hearing, client (+ role), opponent
 * (+ role), the opponent's lawyer, last decision. Every value is read from the case file as saved; none is worked out.
 */
export function headerCells(cf: CaseFile, hs: HearingState, today: string): HeaderCell[] {
  const spec = specSheet(cf);
  const client = cf.parties.find((p) => p.is_our_client);
  const opp = opponentParty(cf);
  const role = (r: string | null | undefined) => (r ? PARTY_ROLE[r as keyof typeof PARTY_ROLE] ?? r : null);
  const clientName = client?.name ?? cf.client?.name ?? null;
  const clientRole = role(client?.role ?? cf.case.client_role);
  const last = lastDecision(cf, today);
  return [
    { key: "case_number", label: spec[0].label, value: spec[0].value },
    { key: "court", label: spec[1].label, value: spec[1].value, fem: true, clip: true },
    { key: "circuit", label: spec[2].label, value: spec[2].value, extra: spec[2].extra, fem: true },
    { key: "next_hearing", label: "الجلسة الجاية", value: hs.next ? formatDmy(hs.next.date) : null, iso: hs.next?.date, fem: true, gold: true },
    { key: "client", label: "الموكل", value: clientName ? [clientName, clientRole].filter(Boolean).join(" · ") : null, clip: true },
    { key: "opponent", label: "الخصم", value: opp ? [opp.name, role(opp.role)].filter(Boolean).join(" · ") : null, clip: true },
    { key: "opponent_lawyer", label: "محامي الخصم", value: opp?.representative?.trim() || null, clip: true },
    { key: "last_decision", label: "آخر قرار", value: last?.text ?? null, clip: true },
  ];
}

