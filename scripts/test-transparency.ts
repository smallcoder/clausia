// Transparency (split layout, PR 4): live steps, the «استخدمت:» footer and drop routing. Free: Gemini is faked (global fetch).
//   - steps come only from real tool events: the steps of a fake turn are exactly the calls it made; no tools = no steps;
//   - the footer lists only the papers used (pages a tool returned, card sources, chip sources), once each, and survives a reload;
//   - drop routing: case → upload, general → picker, wrong type / size / several / busy → an error.
// Run: npx tsx --conditions=react-server --env-file=.env.local scripts/test-transparency.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Db } from "@/lib/supabase/server";
import { loadThread } from "@/components/chat/ThreadView";
import { runAssistantTurn } from "@/lib/assistant/turn";
import { SourceLog, pagesText, parseSources } from "@/lib/assistant/sources";
import { CARD_STEP, readStepLabel } from "@/lib/assistant/step-labels";
import { stepRecorder } from "@/lib/assistant/steps";
import { routeDrop } from "@/lib/documents/drop";
import { MAX_BYTES } from "@/lib/documents/files";
import { createGeneralThread } from "@/lib/threads";

let fails = 0;
const check = (ok: boolean, what: string, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}${extra ? `  (${extra})` : ""}`); if (!ok) fails++; };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const realFetch = globalThis.fetch;
/** Fake Gemini: the n-th model call answers `rounds[n]` (a list of parts); the last one repeats. */
function fakeGemini(rounds: Record<string, unknown>[][]) {
  let n = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
    const parts = rounds[Math.min(n++, rounds.length - 1)];
    return new Response(JSON.stringify({
      candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

// ---------- pure: labels, the source log, drop routing ----------
check(readStepLabel("get_document_text", { pages: [2] }, "صحيفة دعوى") === "بقرا صحيفة دعوى ص 2…", "a page read says the paper and the page");
check(readStepLabel("get_document_text", { pages: [3, 1, 3] }, "عقد") === "بقرا عقد ص 1، 3…", "pages are sorted, once each");
check(readStepLabel("get_document_text", { pages: [1, 2, 3, 4, 5] }, "عقد") === "بقرا عقد ص 1–5…", "many pages are a range");
check(readStepLabel("get_document_text", {}, null) === "بقرا الورقة…", "no pages, no name: only what is known");
check(readStepLabel("get_case", {}) === "بقرا ملف القضية…" && readStepLabel("search_cases", {}) === "بدوّر في القضايا…", "each read tool has its words");
check(readStepLabel("record_decision", {}) === null, "an unknown tool makes no step");

{
  const log = new SourceLog();
  check(log.empty && log.items().length === 0, "an empty log has no items");
  log.addRead("d1", [2, 2, 3]);
  log.addRead("d1", [2]);
  log.addCited("d1", 2, "جملة", 5, 9);
  log.addCited("d1", 2, "جملة تانية", 1, 2); // same page again: the first sentence stays
  log.addCited("d2", 1, "س");
  log.addRead("d3", [1, 2, 3, 4, 5]);
  const items = log.items();
  check(items.filter((i) => i.document_id === "d1").length === 2, "a page read and cited is one item, another page of the paper is another", JSON.stringify(items.filter((i) => i.document_id === "d1").map((i) => i.pages)));
  const p2 = items.find((i) => i.document_id === "d1" && i.pages[0] === 2);
  check(p2?.quote === "جملة" && p2.start === 5 && p2.end === 9, "the cited page keeps the first quote and its span");
  check(items.filter((i) => i.document_id === "d3").length === 1 && same(items.find((i) => i.document_id === "d3")?.pages, [1, 2, 3, 4, 5]), "a paper read page by page past three is one grouped item");
  check(pagesText([1, 2, 3, 4, 5]) === "ص 1–5" && pagesText([2]) === "ص 2" && pagesText([1, 3]) === "ص 1، 3", "page text: a run is a range");
  check(parseSources([{ document_id: "x", pages: [2], quote: null, start: null, end: null }, { nope: 1 }, "x"]).length === 1, "stored sources are checked when read back");
}

const f = (name: string, type: string, size = 1000) => ({ name, type, size });
check(routeDrop([f("a.pdf", "application/pdf")], { caseId: "c1", busy: false }).kind === "upload", "drop in a case: upload to that case");
check(routeDrop([f("a.jpg", "image/jpeg")], { caseId: "c1", busy: false }).kind === "upload", "an image is taken too");
check(routeDrop([f("a.pdf", "application/pdf")], { caseId: null, busy: false }).kind === "pick", "drop in the general context: ask which case");
{
  const r = routeDrop([f("x.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")], { caseId: "c1", busy: false });
  check(r.kind === "error" && r.message.includes("x.docx"), "a wrong type is an error naming the file");
  check(routeDrop([f("x.docx", "application/msword")], { caseId: null, busy: false }).kind === "error", "a wrong type is an error in the general context too (no picker)");
}
check(routeDrop([f("big.pdf", "application/pdf", MAX_BYTES + 1)], { caseId: "c1", busy: false }).kind === "error", "a file over 25 MB is an error");
check(routeDrop([f("a.pdf", "application/pdf"), f("b.pdf", "application/pdf")], { caseId: "c1", busy: false }).kind === "error", "two files at once is an error");
check(routeDrop([], { caseId: "c1", busy: false }).kind === "error", "no file is an error");
check(routeDrop([f("a.pdf", "application/pdf")], { caseId: "c1", busy: true }).kind === "error", "a drop while a turn or an upload runs is an error");

// ---------- the turn, with a fake model, on the real database ----------
async function main() {
  const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: auth, error } = await sb.auth.signInWithPassword({ email: process.env.DEMO_EMAIL!, password: process.env.DEMO_PASSWORD! });
  if (error) throw error;
  const db = sb as unknown as Db;
  const { data: m } = await db.from("office_members").select("office_id").eq("user_id", auth.user.id).single();
  const ctx = { userId: auth.user.id, officeId: m!.office_id };
  const threads: string[] = [];

  const PAGE1 = "الصفحة الأولى من الصحيفة. المدعي عادل النموذجي يقيم بالقاهرة.";
  const PAGE2 = "الصفحة الثانية. أبرم المدعي عقد إيجار مع المدعى عليه بتاريخ سابق.";
  const QUOTE = "أبرم المدعي عقد إيجار مع المدعى عليه";

  /** a fresh general thread with one read paper (2 pages) */
  async function fixture(label: string) {
    const thread = await createGeneralThread(db, `اختبار الشفافية: ${label}`);
    threads.push(thread);
    const { data: doc, error: de } = await db.from("documents").insert({
      thread_id: thread, storage_path: `test/${thread}.pdf`, file_name: "claim.pdf", mime_type: "application/pdf", size_bytes: 10,
      doc_type: "claim_sheet", read_status: "done", page_count: 2,
    }).select("id").single();
    if (de || !doc) throw new Error(de?.message ?? "no document");
    const { error: pe } = await db.from("document_pages").insert([{ document_id: doc.id, page_no: 1, text: PAGE1 }, { document_id: doc.id, page_no: 2, text: PAGE2 }]);
    if (pe) throw new Error(pe.message);
    return { thread, doc: doc.id };
  }
  async function turn(thread: string, text: string) {
    const steps: string[] = [];
    const r = await runAssistantTurn(db, { threadId: thread, userText: text, ...ctx }, { onStep: (s) => steps.push(s) });
    globalThis.fetch = realFetch;
    return { r, steps };
  }

  try {
    // A) two reads, then the answer
    {
      const { thread, doc } = await fixture("قراءة");
      fakeGemini([
        [{ functionCall: { name: "search_cases", args: { query: "عادل" } } }, { functionCall: { name: "get_document_text", args: { document_id: doc, pages: [2] } } }],
        [{ text: "الصفحة التانية فيها عقد إيجار." }],
      ]);
      const { r, steps } = await turn(thread, "اقرأ لي صفحة 2 من الصحيفة");
      check(same(steps, ["بدوّر في القضايا…", "بقرا صحيفة دعوى ص 2…"]), "A: the steps are exactly the calls made, in order", JSON.stringify(steps));
      check(r.sources.length === 1 && r.sources[0].document_id === doc && same(r.sources[0].pages, [2]), "A: one source, the page the tool returned", JSON.stringify(r.sources));
      const { data: rows } = await db.from("chat_messages").select("role, content, sources").eq("thread_id", thread).eq("role", "assistant").order("created_at");
      const withSources = (rows ?? []).filter((x) => x.sources);
      check(withSources.length === 1 && withSources[0].content.includes("عقد إيجار"), "A: the sources are saved on the answer row (the one with words)");
      for (const pass of ["first load", "reload"]) {
        const t = await loadThread(db, thread);
        const last = [...t.items].reverse().find((x) => x.role === "assistant");
        check(last?.used.length === 1 && last.used[0].label === "صحيفة دعوى · ص 2" && last.used[0].page === 2, `A: the footer is there after ${pass}`, JSON.stringify(last?.used));
        check(t.items.filter((x) => x.role === "user").every((x) => x.used.length === 0), `A: the lawyer's message has no footer (${pass})`);
      }
    }

    // B) no tools: no steps, no footer
    {
      const { thread } = await fixture("بدون أدوات");
      fakeGemini([[{ text: "أهلًا، تحب أساعدك في إيه؟" }]]);
      const { r, steps } = await turn(thread, "أهلا");
      check(steps.length === 0, "B: a turn with no tools has no steps", JSON.stringify(steps));
      check(r.sources.length === 0, "B: and no sources");
      const { data: rows } = await db.from("chat_messages").select("sources").eq("thread_id", thread).eq("role", "assistant");
      check((rows ?? []).every((x) => x.sources === null), "B: nothing stored on the answer");
      const t = await loadThread(db, thread);
      check(t.items.every((x) => x.used.length === 0), "B: no footer");
    }

    // C) the same pages read twice + a card that cites page 2 + a lookup that finds nothing
    {
      const { thread, doc } = await fixture("بطاقة");
      fakeGemini([
        [
          { functionCall: { name: "get_document_text", args: { document_id: doc, pages: [2] } } },
          { functionCall: { name: "get_document_text", args: { document_id: doc, pages: [1, 2] } } },
          { functionCall: { name: "get_document_text", args: { document_id: "00000000-0000-4000-8000-000000000000" } } },
        ],
        [{ functionCall: { name: "create_client", args: { name: "عادل النموذجي", kind: "person", quote: QUOTE } } }],
        [{ text: "جهّزت لك بطاقة بالموكل." }],
      ]);
      const { r, steps } = await turn(thread, "جهّز لي الموكل من الصحيفة");
      check(same(steps, ["بقرا صحيفة دعوى ص 2…", "بقرا صحيفة دعوى ص 1، 2…", "بقرا الورقة…", CARD_STEP]), "C: reads, a read that finds nothing, then the card — each as it ran", JSON.stringify(steps));
      const keys = r.sources.map((s) => `${s.document_id}:${s.pages.join(",")}`);
      check(new Set(keys).size === keys.length && same(r.sources.map((s) => s.pages[0]), [1, 2]), "C: pages 1 and 2, no duplicates", JSON.stringify(keys));
      const p2 = r.sources.find((s) => s.pages[0] === 2);
      check(p2?.quote === QUOTE && p2.start != null && p2.end != null && PAGE2.slice(p2.start, p2.end) === QUOTE, "C: the page the card cites carries its sentence and span", JSON.stringify(p2));
      const p1 = r.sources.find((s) => s.pages[0] === 1);
      check(p1?.quote === null, "C: a page that was only read has no sentence");
      const t = await loadThread(db, thread);
      const last = [...t.items].reverse().find((x) => x.role === "assistant" && x.content.trim());
      check(last?.used.length === 2 && last.proposals.length === 1, "C: the footer sits under the answer that carries the card", `${last?.used.length}/${last?.proposals.length}`);
    }

    // D) a context chip that points at an item with a paper source
    {
      const { data: fact } = await db.from("case_facts").select("id, case_id, source_document_id, source_page").not("source_document_id", "is", null).not("source_page", "is", null).limit(1).maybeSingle();
      if (!fact) console.log("SKIP  D: no fact with a paper source in this office");
      else {
        const thread = await createGeneralThread(db, "اختبار الشفافية: شارة سياق");
        threads.push(thread);
        fakeGemini([[{ text: "الواقعة دي مأخوذة من الورقة." }]]);
        const steps: string[] = [];
        const r = await runAssistantTurn(db, { threadId: thread, userText: "اشرح لي الواقعة دي", ...ctx, context: [{ kind: "fact", id: fact.id, label: "واقعة" }] }, { onStep: (s) => steps.push(s) });
        globalThis.fetch = realFetch;
        check(steps.length === 0, "D: a chip makes no step by itself");
        check(r.sources.length === 1 && r.sources[0].document_id === fact.source_document_id && r.sources[0].pages[0] === fact.source_page, "D: the chip's own paper source is in the footer", JSON.stringify(r.sources));
      }
      {
        const thread = await createGeneralThread(db, "اختبار الشفافية: شارة بلا ورقة");
        threads.push(thread);
        fakeGemini([[{ text: "تمام." }]]);
        const { data: party } = await db.from("case_parties").select("id").is("source_document_id", null).limit(1).maybeSingle();
        if (party) {
          const r = await runAssistantTurn(db, { threadId: thread, userText: "مين ده؟", ...ctx, context: [{ kind: "party", id: party.id, label: "طرف" }] });
          globalThis.fetch = realFetch;
          check(r.sources.length === 0, "D: a chip from the lawyer's own words (no paper) adds no source");
        }
      }
    }

    // E) the recorder writes the steps while the turn runs and removes them when it ends
    {
      const turnId = crypto.randomUUID();
      const rec = stepRecorder(db, turnId);
      rec.onStep?.("بقرا ملف القضية…");
      rec.onStep?.(CARD_STEP);
      let rows: { seq: number; label: string }[] = [];
      for (let i = 0; i < 20 && rows.length < 2; i++) {
        await new Promise((x) => setTimeout(x, 150));
        rows = (await db.from("chat_turn_steps").select("seq, label").eq("turn_id", turnId).order("seq")).data ?? [];
      }
      check(same(rows, [{ seq: 1, label: "بقرا ملف القضية…" }, { seq: 2, label: CARD_STEP }]), "E: the steps are readable, in order, while the turn runs", JSON.stringify(rows));
      const after = (await db.from("chat_turn_steps").select("seq").eq("turn_id", turnId).gt("seq", 1)).data ?? [];
      check(after.length === 1 && after[0].seq === 2, "E: «after» skips what the browser has seen");
      await rec.finish();
      const left = (await db.from("chat_turn_steps").select("seq").eq("turn_id", turnId)).data ?? [];
      check(left.length === 0, "E: the turn removes its steps when it ends");
      const none = stepRecorder(db, "not-a-uuid");
      check(none.onStep === undefined, "E: an id that is not a uuid records nothing (and is not an error)");
      await none.finish();
    }
  } finally {
    globalThis.fetch = realFetch;
    for (const t of threads) {
      await db.from("proposals").delete().eq("thread_id", t);
      await db.from("documents").delete().eq("thread_id", t);
      await db.from("chat_threads").delete().eq("id", t);
    }
  }
  console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
