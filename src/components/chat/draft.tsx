"use client";
/**
 * The composer's text and mode live above the chat panel (in the split shell), so a half-written message and the chosen
 * mode survive when the lawyer moves between pages or sessions. One composer for the whole app.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ChatMode } from "@/lib/assistant/modes";

interface Draft {
  text: string;
  setText: (v: string | ((cur: string) => string)) => void;
  mode: ChatMode;
  setMode: (m: ChatMode) => void;
}

const Ctx = createContext<Draft | null>(null);

/** Who is signed in (for the phone's picker: it has no top bar, so the account menu lives there). */
export interface Account { officeName: string; email: string }
const AccountCtx = createContext<Account>({ officeName: "", email: "" });
export const useAccount = () => useContext(AccountCtx);

export function DraftProvider({ children, account }: { children: ReactNode; account: Account }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ChatMode>("ask");
  const value = useMemo(() => ({ text, setText, mode, setMode }), [text, mode]);
  return <AccountCtx.Provider value={account}><Ctx.Provider value={value}>{children}</Ctx.Provider></AccountCtx.Provider>;
}

export function useDraft(): Draft {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDraft needs the DraftProvider");
  return v;
}
