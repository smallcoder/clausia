// The chat panel on Home ("/"): the general context. Every deeper path is @chat/[...path].
import { ChatSlot, type SlotSearch } from "@/components/chat/ChatSlot";

export default function ChatSlotHome({ searchParams }: { searchParams: Promise<SlotSearch> }) {
  return <ChatSlot searchParams={searchParams} />;
}
