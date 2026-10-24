import "server-only";
/**
 * The chat panel's data for one URL (the @chat slot calls this on every navigation).
 * Context: a case page (/cases/<id>…) is that case's context; every other page is the general one.
 * Session: ?s=<thread> (it must belong to the context), ?s=new, ?hearing=<id> (the case's session for that hearing, or a
 * new one), else a case's latest session; the general context starts empty. All reads use the lawyer's own client (RLS).
 */
import { formatDmy, todayIso } from "@/lib/dates";
import { caseLabel } from "@/lib/labels";
import type { Db } from "@/lib/supabase/server";
import { loadMorning } from "@/lib/morning/load";
import { hearingThread, latestCaseThread, latestClientThread, listSessions } from "@/lib/threads";
import type { PanelContext, PanelData } from "./panel-types";
import { shortDay } from "./panel-types";
import { loadThread } from "./ThreadView";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Who = { userId: string; displayName: string };

async function caseContext(db: Db, caseId: string): Promise<PanelContext | null> {
  const [{ data: c }, { data: next }] = await Promise.all([
    db.from("cases").select("id, case_number, case_year, title, court, circuit, clients(name)").eq("id", caseId).maybeSingle(),
    db.from("hearings").select("hearing_date").eq("case_id", caseId).gte("hearing_date", todayIso()).neq("review_status", "rejected").order("hearing_date").limit(1).maybeSingle(),
  ]);
  if (!c) return null;
  const client = c.clients?.name ?? null;
  const number = c.case_number ? (c.case_year ? `${c.case_number}/${c.case_year}` : c.case_number) : null;
  return {
    kind: "case", id: c.id,
    pill: `قضية ${client?.split(/\s+/)[0] ?? caseLabel(c)}`,
    name: client ?? caseLabel(c),
    strip: {
      title: [c.title ?? (number ? null : "دعوى بلا رقم"), number].filter(Boolean).join(" · "),
      meta: [c.court, c.circuit ? `د ${c.circuit}` : null, next ? `الجلسة الجاية ${shortDay(next.hearing_date)}` : null].filter(Boolean).join(" · "),
    },
  };
}

async function clientContext(db: Db, clientId: string): Promise<PanelContext | null> {
  const { data: c } = await db.from("clients").select("id, name").eq("id", clientId).neq("review_status", "rejected").maybeSingle();
  if (!c) return null;
  const { data: cases } = await db.from("cases").select("id").eq("client_id", clientId).neq("review_status", "rejected");
  const ids = (cases ?? []).map((x) => x.id);
  const { data: next } = ids.length
    ? await db.from("hearings").select("hearing_date").in("case_id", ids).gte("hearing_date", todayIso()).neq("review_status", "rejected").order("hearing_date").limit(1).maybeSingle()
    : { data: null };
  const n = ids.length;
  return {
    kind: "client", id: c.id,
    pill: `موكل ${c.name.split(/\s+/)[0]}`,
    name: c.name,
    strip: { title: c.name, meta: [n === 1 ? "قضية واحدة" : n === 2 ? "قضيتين" : n ? `${n} ${n <= 10 ? "قضايا" : "قضية"}` : "بلا قضايا", next ? `الجلسة الجاية ${shortDay(next.hearing_date)}` : null].filter(Boolean).join(" · ") },
  };
}

export async function loadPanel(db: Db, path: string[] | undefined, sp: { s?: string; hearing?: string; q?: string }, who: Who | Promise<Who | null> | null = null): Promise<PanelData> {
  const wantCase = path?.[0] === "cases" && path[1] && UUID.test(path[1]) ? path[1] : null;
  const wantClient = path?.[0] === "clients" && path[1] && UUID.test(path[1]) ? path[1] : null;
  const ctx = wantCase ? await caseContext(db, wantCase) : wantClient ? await clientContext(db, wantClient) : null;
  const context: PanelContext = ctx ?? { kind: "general" };
  const caseId = context.kind === "case" ? context.id : null;
  const clientId = context.kind === "client" ? context.id : null;

  // the general context starts with the morning brief, the «noticed» cards and chips built from the lawyer's own cases.
  // It is the slowest part, so it starts here (beside the reads below) and is NOT awaited: the panel gets the promise and the brief
  // streams in after the rest (ChatThread, under Suspense).
  const morning: PanelData["morning"] = !caseId && !clientId && who
    ? Promise.resolve(who).then((w) => (w ? loadMorning(db, w.userId, w.displayName) : null)).catch((e) => {
        console.error("morning brief failed", e); // the chat still works: it falls back to the plain greeting
        return null;
      })
    : null;

  // «سجّل قرار جلسة d/m»: the latest hearing of this case that is due (today or past, no decision yet); read beside the rest
  const dueQuery = caseId
    ? Promise.resolve(db.from("hearings").select("hearing_date").eq("case_id", caseId).is("decision_type", null).lte("hearing_date", todayIso())
      .neq("review_status", "rejected").order("hearing_date", { ascending: false }).limit(1).maybeSingle())
    : null;

  const sessions = await listSessions(db, caseId, 40, clientId);

  // which session is open
  let threadId: string | null = null;
  let hearing: { id: string; date: string } | null = null;
  const s = sp.s ?? "";
  if (UUID.test(s)) {
    const { data: t } = await db.from("chat_threads").select("id, case_id, client_id").eq("id", s).maybeSingle();
    if (t && (t.case_id ?? null) === caseId && (t.client_id ?? null) === clientId) threadId = t.id; // a link to another context's session is ignored
  }
  if (!threadId && s !== "new" && clientId) threadId = await latestClientThread(db, clientId);
  if (!threadId && s !== "new" && caseId) {
    const h = sp.hearing && UUID.test(sp.hearing)
      ? (await db.from("hearings").select("id, hearing_date").eq("id", sp.hearing).eq("case_id", caseId).maybeSingle()).data : null;
    if (h) {
      hearing = { id: h.id, date: h.hearing_date };
      threadId = await hearingThread(db, caseId, h.id);
    } else {
      threadId = await latestCaseThread(db, caseId);
    }
  }

  const [data, linked] = threadId
    ? await Promise.all([
        loadThread(db, threadId),
        hearing ? null : db.from("chat_threads").select("hearings(id, hearing_date)").eq("id", threadId).maybeSingle(),
      ])
    : [null, null];
  if (linked?.data?.hearings) hearing = { id: linked.data.hearings.id, date: linked.data.hearings.hearing_date };

  // a general session that is about a case: a card in it points at that case (or created it)
  let moveOffer: PanelData["moveOffer"] = null;
  if (data && !caseId && !clientId) {
    const ps = [...data.proposals].reverse();
    const created = ps.flatMap((p) => p.ops).find((o) => o.tool === "create_case" && o.result_id && (o.status === "confirmed" || o.status === "suggested"))?.result_id ?? null;
    const target = ps.find((p) => p.case_id)?.case_id ?? created;
    if (target && UUID.test(target)) {
      const { data: c } = await db.from("cases").select("id, case_number, case_year, title, clients(name)").eq("id", target).maybeSingle();
      if (c) moveOffer = { caseId: c.id, label: c.clients?.name ?? caseLabel(c) };
    }
  }

  const chips: PanelData["chips"] = [];
  if (dueQuery) {
    const { data: due } = await dueQuery;
    if (due) {
      const d = formatDmy(due.hearing_date).replace(/\/\d{4}$/, "");
      chips.push({ label: `سجّل قرار جلسة ${d}`, text: `قرار جلسة ${d}: ` });
    }
  }

  return {
    context, sessions, threadId, hearing,
    thread: data ? { items: data.items, lookup: data.lookup, rows: data.rows, deadlines: data.deadlines, docs: data.docs } : null,
    moveOffer, chips, morning, starter: (sp.q ?? "").slice(0, 300),
  };
}
