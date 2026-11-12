import { PackagesTable } from "@/components/admin/packages-table";

export const metadata = {
  title: "All packages | H2H Express",
};

export default function AllPackagesPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">All packages</h1>
      <PackagesTable />
    </main>
  );
}
