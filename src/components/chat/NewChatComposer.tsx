"use client";
/**
 * The /chat list's composer: the thread's two-row glass box (ChatComposer) for a NEW conversation (owner decision:
 * the list uses the thread's style). Sending or attaching a paper starts a general thread and opens it.
 */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useReadProgress } from "@/components/documents/useReadProgress";
import { composerSendAction, composerUploadAction } from "@/lib/assistant/composer-actions";
import { ChatComposer } from "./ChatComposer";

export function NewChatComposer({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const progress = useReadProgress(reading);
  const [pending, start] = useTransition();
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function send() {
    const t = text.trim();
    if (!t || pending) return;
    setError(null);
    setStatus("Clausia بيكتب…");
    start(async () => {
      const r = await composerSendAction({ kind: "new" }, t);
      setStatus(null);
      if (r.error) { setError(r.error); return; }
      setText("");
      if (r.threadId) router.push(`/chat/${r.threadId}`);
    });
  }

  function onFile(f: File | undefined) {
    if (!f || pending) return;
    setError(null);
    setReading(true);
    const fd = new FormData();
    fd.set("file", f);
    start(async () => {
      const r = await composerUploadAction({ kind: "new" }, fd);
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (r.error) setError(r.error);
      if (r.threadId) router.push(`/chat/${r.threadId}`);
    });
  }

  return (
    <ChatComposer id="new" value={text} onChange={setText} onSend={send} onFile={onFile}
      sending={pending} busy={pending} status={reading ? progress : status} error={error} onDismissError={() => setError(null)}
      placeholder={placeholder} boxRef={boxRef} fileRef={fileRef} />
  );
}
