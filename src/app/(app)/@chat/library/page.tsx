// The chat panel on the library page (no content yet): the general context.
import { ChatSlot, type SlotSearch } from "@/components/chat/ChatSlot";

export default function ChatSlotLibrary({ searchParams }: { searchParams: Promise<SlotSearch> }) {
  return <ChatSlot searchParams={searchParams} />;
}
