import { notFound } from "next/navigation";
import { packageViews } from "@/components/admin/package-views";
import { PackagesTable } from "@/components/admin/packages-table";

export function generateStaticParams() {
  return packageViews.map(({ slug }) => ({ status: slug }));
}

export default async function PackageStatusPage({ params }) {
  const { status } = await params;
  const view = packageViews.find(({ slug }) => slug === status);
  if (!view) notFound();

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{view.label}</h1>
      <PackagesTable key={view.slug} status={view.status} />
    </main>
  );
}
