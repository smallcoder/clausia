// The chat panel on a case page: that case's context (its latest session, ?s=, or ?hearing=).
import { ChatSlot, type SlotSearch } from "@/components/chat/ChatSlot";

export default async function ChatSlotCase({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SlotSearch> }) {
  const { id } = await params;
  return <ChatSlot path={["cases", id]} searchParams={searchParams} />;
}
