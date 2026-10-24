// The chat panel beside the preview page of the draft editor (development only, see ../../zz-preview-draft/page.tsx): the demo case's chat.
import { notFound } from "next/navigation";
import { ChatSlot, type SlotSearch } from "@/components/chat/ChatSlot";

export default async function ChatSlotPreviewDraft({ searchParams }: { searchParams: Promise<SlotSearch> }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <ChatSlot path={["cases", "72071d66-4ab3-4682-9c3d-1ff65cdc2369"]} searchParams={searchParams} />;
}
