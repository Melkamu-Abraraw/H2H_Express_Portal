import { PaymentsView } from "@/components/admin/payments-view";

export const metadata = {
  title: "Payments | H2H Express",
};

export default function PaymentsPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Collect balances on packages and review every payment received.
        </p>
      </div>
      <PaymentsView />
    </main>
  );
}
