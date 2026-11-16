import { ChatView } from "@/components/admin/chat-view";

export const metadata = {
  title: "Chat | H2H Express",
};

export default function ChatPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
        <p className="text-sm text-muted-foreground">Talk with the team, your branch, or one person.</p>
      </div>
      <ChatView />
    </main>
  );
}
