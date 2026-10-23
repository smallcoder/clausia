"use client";
/**
 * Small state the sidebar, the chat panel and the page column share (docs/design/ia):
 *  - `full`: the chat is full screen and the page is hidden (desktop). Remembered per user in this browser (localStorage, a convenience, not app data).
 *  - `drawer`: the sidebar is open as a side drawer (below 1280).
 *  - `openThread`: the chat session that is open now (the chat panel says it), so the sidebar can mark it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface Shell {
  full: boolean;
  setFull: (v: boolean) => void;
  drawer: boolean;
  setDrawer: (v: boolean) => void;
  openThread: string | null;
  setOpenThread: (id: string | null) => void;
}

const Ctx = createContext<Shell | null>(null);

const keyOf = (userId: string) => `clausia:chat-full:${userId}`;

export function ShellProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [full, setFullState] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [openThread, setOpenThread] = useState<string | null>(null);

  // the saved choice is read after the first paint (the server cannot see localStorage): a returning full-screen user sees the page for a frame
  useEffect(() => {
    try { if (localStorage.getItem(keyOf(userId)) === "1") setFullState(true); } catch { /* no storage: the default */ }
  }, [userId]);

  const setFull = useCallback((v: boolean) => {
    setFullState(v);
    try { if (v) localStorage.setItem(keyOf(userId), "1"); else localStorage.removeItem(keyOf(userId)); } catch { /* not saved */ }
  }, [userId]);

  const value = useMemo(() => ({ full, setFull, drawer, setDrawer, openThread, setOpenThread }), [full, setFull, drawer, openThread]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell(): Shell {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShell needs the ShellProvider");
  return v;
}
