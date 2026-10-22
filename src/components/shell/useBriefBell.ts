"use client";
/**
 * What the top bar's bell shows besides «محتاجة قرار»: the evening brief and the 07:00 reminder. A client check once a minute
 * (no server job, no service worker), so it works while Clausia is open in a tab:
 *  - from 20:00 Cairo until midnight: «تحضير جلسات بكرة جاهز» → /brief, and ONE browser notification a day;
 *  - a reminder the lawyer saved («ذكّرني الصبح 7») whose time has come → «تذكير: …» → /brief?date=…, one notification each.
 * «Shown / notified today» is remembered per user in this browser (localStorage). Opening /brief clears the evening dot.
 * The browser notification appears only if the lawyer allowed notifications (asked on the bell or «الإعدادات» tap, not here).
 */
import { useCallback, useEffect, useState } from "react";
import { dayWord } from "@/lib/brief/build";
import { dismissReminderAction, dueRemindersAction } from "@/lib/brief/actions";
import { flag, setFlag, showNotification } from "@/lib/brief/notify";
import { briefDay, briefReady, cairoClock } from "@/lib/brief/time";

export interface BellItem { key: string; label: string; body: string; href: string; /** a reminder row (dismissed when opened) */ reminderId?: string }

const EVENING = "تحضير جلسات بكرة جاهز";
const POLL_MS = 60_000;

export function useBriefBell(userId: string, path: string): { items: BellItem[]; opened: (i: BellItem) => void } {
  const [items, setItems] = useState<BellItem[]>([]);

  const tick = useCallback(async () => {
    const now = new Date();
    const out: BellItem[] = [];
    if (briefReady(now)) {
      const day = briefDay(now);
      const onBrief = path.startsWith("/brief");
      const seen = `clausia:brief-seen:${userId}:${day}`;
      if (onBrief) setFlag(seen);
      if (!flag(seen)) out.push({ key: `brief-${day}`, label: EVENING, body: "جلسات بكرة وإيه الناقص فيها.", href: "/brief" });
      const sent = `clausia:brief-notified:${userId}:${day}`;
      if (!flag(sent) && showNotification("Clausia", EVENING, "/brief", `brief-${day}`)) setFlag(sent);
    }
    const today = cairoClock(now).date;
    for (const r of await dueRemindersAction()) {
      const href = `/brief?date=${r.forDate}`;
      out.push({ key: `reminder-${r.id}`, label: `تذكير: تحضير جلسات ${dayWord(r.forDate, today)}`, body: "الساعة 7 الصبح.", href, reminderId: r.id });
      const sent = `clausia:reminder-notified:${userId}:${r.id}`;
      if (!flag(sent) && showNotification("Clausia", `تذكير: تحضير جلسات ${dayWord(r.forDate, today)}`, href, `reminder-${r.id}`)) setFlag(sent);
    }
    setItems(out);
  }, [userId, path]);

  useEffect(() => {
    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    return () => clearInterval(t);
  }, [tick]);

  const opened = useCallback((i: BellItem) => {
    if (i.reminderId) void dismissReminderAction(i.reminderId).then(() => tick());
  }, [tick]);

  return { items, opened };
}
