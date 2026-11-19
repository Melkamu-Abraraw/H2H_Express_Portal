import { HANDLING } from "@/lib/handling";
import { statusDots } from "@/components/admin/package-views";
import { PackagesTable } from "@/components/admin/packages-table";

export const metadata = {
  title: "All packages | H2H Express",
};

export default async function AllPackagesPage({ searchParams }) {
  // /admin/packages?handling=fragile, ?q=<tracking #> or ?status=In%20transit opens the list
  // already filtered (used by the dashboard).
  const { handling, q, status } = await searchParams;
  const initialStatus = Object.hasOwn(statusDots, status ?? "") ? status : undefined;
  const initialSearch = typeof q === "string" ? q.slice(0, 60) : "";
  const initialHandling = HANDLING.some((item) => item.key === handling) ? handling : undefined;

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">All packages</h1>
      <PackagesTable
        key={`${initialHandling ?? "all"}:${initialSearch}:${initialStatus ?? "any"}`}
        initialHandling={initialHandling}
        initialSearch={initialSearch}
        initialStatus={initialStatus}
      />
    </main>
  );
}
