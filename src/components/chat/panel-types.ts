/** What the server hands the chat panel (see panel-data.ts) and the small URL rules both sides share. No server-only import. */
import type { DeadlineCardEntry } from "@/lib/deadlines/cards";
import type { EditRow } from "@/lib/edits";
import type { Chip, MorningData } from "@/lib/morning/types";
import type { Session } from "@/lib/threads";
import type { ChatItem, ThreadDoc } from "./ChatThread";

export type { Session };

/** The context a chat belongs to: the general one (Home, Roll, Cases list …), one case, or one client. */
export type PanelContext =
  | { kind: "general" }
  | {
      kind: "client"; id: string;
      /** «موكل عادل»: the phone's context pill */
      pill: string;
      /** «عادل النموذجي»: the panel header's «الموكل · …» */
      name: string;
      /** the phone's strip: the name, then «3 قضايا · الجلسة الجاية 22/10» */
      strip: { title: string; meta: string };
    }
  | {
      kind: "case"; id: string;
      /** «قضية عادل»: the phone's context pill */
      pill: string;
      /** «عادل النموذجي»: the panel header's «في قضية …» */
      name: string;
      /** the phone's case strip: «إخلاء لعدم سداد الأجرة · 772/2025» and «شمال القاهرة · د 3 · الجلسة الجاية 22/10» */
      strip: { title: string; meta: string };
    };

export interface PanelData {
  context: PanelContext;
  /** the sessions of THIS context only, newest first */
  sessions: Session[];
  /** the open session: null = a new one (made with the first message) */
  threadId: string | null;
  /** «جلسة 22/10»: the open session (or the one about to be made) is about this hearing */
  hearing: { id: string; date: string } | null;
  thread: { items: ChatItem[]; lookup: Record<string, string>; rows: Record<string, EditRow[]>; deadlines: Record<string, DeadlineCardEntry>; docs: Record<string, ThreadDoc> } | null;
  /** a general session that is about a case: «انقل المحادثة دي لقضية X» */
  moveOffer: { caseId: string; label: string } | null;
  /** starter chips above the composer (they fill the box; nothing is sent) */
  chips: Chip[];
  /** the general context's top: the morning brief and the «noticed» cards (null in a case, or when it could not be built) */
  morning: MorningData | null;
  /** a starter sentence from a link (?q=); it fills the box, nothing is sent */
  starter: string;
}

/** The query params the panel owns: the open session, a hearing, a starter sentence. Others belong to the page. */
export const PANEL_PARAMS = ["s", "hearing", "q"] as const;

/** `href` with the open session (`s`) changed; `s = null` drops it. The hearing link and the starter go too (a chosen session wins). */
export function withSession(pathname: string, params: URLSearchParams, s: string | null): string {
  const next = new URLSearchParams(params);
  for (const k of PANEL_PARAMS) next.delete(k);
  if (s) next.set("s", s);
  const q = next.toString();
  return q ? `${pathname}?${q}` : pathname;
}

/** «22/10» for a yyyy-mm-dd date (the hearing session's label). */
export function shortDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
}
