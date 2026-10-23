"use client";
/**
 * The composer's text and mode live above the chat panel (in the split shell), so a half-written message and the chosen
 * mode survive when the lawyer moves between pages or sessions. One composer for the whole app.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { askKey, MAX_ASK, type AskItem } from "@/lib/assistant/ask";
import type { ChatMode } from "@/lib/assistant/modes";

interface Draft {
  text: string;
  setText: (v: string | ((cur: string) => string)) => void;
  mode: ChatMode;
  setMode: (m: ChatMode) => void;
  /** the items attached with «اسأل Clausia» (context chips): they go with the next message, as data */
  chips: AskItem[];
  addChip: (i: AskItem) => void;
  removeChip: (key: string) => void;
  clearChips: () => void;
  /** goes up each time something asks the composer to take the cursor (the chat panel listens) */
  focusTick: number;
  focusComposer: () => void;
}

const Ctx = createContext<Draft | null>(null);

/** Who is signed in (for the phone's picker: it has no top bar, so the account menu lives there). */
export interface Account { officeName: string; email: string }
const AccountCtx = createContext<Account>({ officeName: "", email: "" });
export const useAccount = () => useContext(AccountCtx);

export function DraftProvider({ children, account }: { children: ReactNode; account: Account }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ChatMode>("ask");
  const [chips, setChips] = useState<AskItem[]>([]);
  const [focusTick, setFocusTick] = useState(0);
  const addChip = useCallback((i: AskItem) => setChips((cur) => (cur.some((c) => askKey(c) === askKey(i)) ? cur : [...cur, i].slice(-MAX_ASK))), []);
  const removeChip = useCallback((key: string) => setChips((cur) => cur.filter((c) => askKey(c) !== key)), []);
  const clearChips = useCallback(() => setChips([]), []);
  const focusComposer = useCallback(() => setFocusTick((n) => n + 1), []);
  const value = useMemo(() => ({ text, setText, mode, setMode, chips, addChip, removeChip, clearChips, focusTick, focusComposer }), [text, mode, chips, addChip, removeChip, clearChips, focusTick, focusComposer]);
  return <AccountCtx.Provider value={account}><Ctx.Provider value={value}>{children}</Ctx.Provider></AccountCtx.Provider>;
}

export function useDraft(): Draft {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDraft needs the DraftProvider");
  return v;
}
