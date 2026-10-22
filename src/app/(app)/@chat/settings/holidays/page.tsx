// The chat panel on the court-holidays settings page (/settings/holidays): the general context.
// (There is no /settings page of its own: a slot page with no page beside it would not match any route.)
import { ChatSlot, type SlotSearch } from "@/components/chat/ChatSlot";

export default function ChatSlotHolidays({ searchParams }: { searchParams: Promise<SlotSearch> }) {
  return <ChatSlot searchParams={searchParams} />;
}
