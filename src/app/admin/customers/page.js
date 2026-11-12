import { CustomersTable } from "@/components/admin/customers-table";

export const metadata = {
  title: "Customers | H2H Express",
};

export default function CustomersPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">
          People who send or receive packages, and travelers who carry them.
        </p>
      </div>
      <CustomersTable />
    </main>
  );
}
