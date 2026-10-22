// The old conversations list: sessions are listed from the chat panel's sessions button now (and, on a phone, its context
// picker), so the old link just opens Home, whose chat starts a new general session.
import { redirect } from "next/navigation";

export default function ChatList() {
  redirect("/");
}
