// The chat panel on «ورق المكتب» (/settings/office-style): the general context.
import { ChatSlot, type SlotSearch } from "@/components/chat/ChatSlot";

export default function ChatSlotOfficeStyle({ searchParams }: { searchParams: Promise<SlotSearch> }) {
  return <ChatSlot searchParams={searchParams} />;
}
