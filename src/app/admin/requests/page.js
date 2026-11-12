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
          Orders submitted on the public page. Check them against the physical package, correct the
          weight, then register them. Nothing is tracked or sent to the customer until you do.
        </p>
      </div>
      <RequestsView />
    </main>
  );
}
