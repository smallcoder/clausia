"use client";
/**
 * Browser notifications for the brief and its reminder (client only, no service worker, no server job: it works while
 * Clausia is open in a tab). Permission is asked ONLY from `askPermission`, which the screen calls when the lawyer taps
 * «الإعدادات» or the bell; never on page load. Everything is wrapped: a browser without notifications, a blocked
 * permission or private-mode storage just means no pop-up.
 */

export type NotifyState = "granted" | "denied" | "default" | "unsupported";

export function notifyState(): NotifyState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Ask the browser (a no-op when it was already answered). Call it from a tap. */
export async function askPermission(): Promise<NotifyState> {
  if (notifyState() !== "default") return notifyState();
  try {
    await Notification.requestPermission();
  } catch {
    // an old browser that wants a callback, or a blocked prompt: the state below says what happened
  }
  return notifyState();
}

/** Show one notification when the lawyer allowed them; clicking it opens `href` in this tab. Returns whether it was shown. */
export function showNotification(title: string, body: string, href: string, tag: string): boolean {
  if (notifyState() !== "granted") return false;
  try {
    const n = new Notification(title, { body, tag, lang: "ar", dir: "rtl" });
    n.onclick = () => { window.focus(); window.location.assign(href); n.close(); };
    return true;
  } catch {
    return false;
  }
}

/** a tiny per-browser flag (localStorage); every access is guarded */
export function flag(key: string): boolean {
  try { return window.localStorage.getItem(key) === "1"; } catch { return false; }
}
export function setFlag(key: string): void {
  try { window.localStorage.setItem(key, "1"); } catch { /* storage blocked: the flag just does not stick */ }
}
