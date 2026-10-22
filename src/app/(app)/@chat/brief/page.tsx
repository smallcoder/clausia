// The chat panel on the brief: the general context.
import { ChatSlot, type SlotSearch } from "@/components/chat/ChatSlot";

export default function ChatSlotBrief({ searchParams }: { searchParams: Promise<SlotSearch> }) {
  return <ChatSlot searchParams={searchParams} />;
}
