import { RoutesView } from "@/components/admin/routes-view";

export const metadata = {
  title: "Routes | H2H Express",
};

export default function RoutesPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Routes</h1>
        <p className="text-sm text-muted-foreground">
          Where H2H Express ships, what each route charges, and who carries the packages.
        </p>
      </div>
      <RoutesView />
    </main>
  );
}
