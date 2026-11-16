import { HANDLING } from "@/lib/handling";
import { PackagesTable } from "@/components/admin/packages-table";

export const metadata = {
  title: "All packages | H2H Express",
};

export default async function AllPackagesPage({ searchParams }) {
  // /admin/packages?handling=fragile or ?q=<tracking #> opens the list already filtered (used by the dashboard).
  const { handling, q } = await searchParams;
  const initialSearch = typeof q === "string" ? q.slice(0, 60) : "";
  const initialHandling = HANDLING.some((item) => item.key === handling) ? handling : undefined;

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">All packages</h1>
      <PackagesTable
        key={`${initialHandling ?? "all"}:${initialSearch}`}
        initialHandling={initialHandling}
        initialSearch={initialSearch}
      />
    </main>
  );
}
