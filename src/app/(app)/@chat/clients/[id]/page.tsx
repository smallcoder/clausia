// The chat panel on a client's page: that client's context (its latest session, or ?s=).
import { ChatSlot, type SlotSearch } from "@/components/chat/ChatSlot";

export default async function ChatSlotClient({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SlotSearch> }) {
  const { id } = await params;
  return <ChatSlot path={["clients", id]} searchParams={searchParams} />;
}
