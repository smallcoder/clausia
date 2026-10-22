// The chat panel on the Cases list: the general context.
import { ChatSlot, type SlotSearch } from "@/components/chat/ChatSlot";

export default function ChatSlotCases({ searchParams }: { searchParams: Promise<SlotSearch> }) {
  return <ChatSlot searchParams={searchParams} />;
}
