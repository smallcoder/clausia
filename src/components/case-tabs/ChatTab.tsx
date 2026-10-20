// The case's own conversation inside the case page (same thread UI as /chat/[threadId]).
import { ThreadView } from "@/components/chat/ThreadView";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCaseThread } from "@/lib/threads";

export async function ChatTab({ caseId }: { caseId: string }) {
  const db = await createClient();
  const threadId = await getOrCreateCaseThread(db, caseId);
  return <ThreadView db={db} threadId={threadId} caseId={caseId} />;
}
