import { RequestsView } from "@/components/admin/requests-view";

export const metadata = {
  title: "Requests | H2H Express",
};

export default function RequestsPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
        <p className="text-sm text-muted-foreground">
          Review online orders, verify packages, correct details if needed, and register them to start
          tracking and customer notifications.
        </p>
      </div>
      <RequestsView />
    </main>
  );
}
