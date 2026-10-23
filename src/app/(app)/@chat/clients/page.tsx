// The chat panel on the clients page (no content yet): the general context.
import { ChatSlot, type SlotSearch } from "@/components/chat/ChatSlot";

export default function ChatSlotClients({ searchParams }: { searchParams: Promise<SlotSearch> }) {
  return <ChatSlot searchParams={searchParams} />;
}
