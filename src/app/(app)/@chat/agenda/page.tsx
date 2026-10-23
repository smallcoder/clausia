// The chat panel on the agenda: the "agenda" context. Like the Roll's it is the general one: its sessions are the general sessions (?s=…).
import { ChatSlot, type SlotSearch } from "@/components/chat/ChatSlot";

export default function ChatSlotAgenda({ searchParams }: { searchParams: Promise<SlotSearch> }) {
  return <ChatSlot searchParams={searchParams} />;
}
