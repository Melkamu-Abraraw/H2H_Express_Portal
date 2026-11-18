import { BagsReport } from "@/components/admin/bags-report";

export const metadata = {
  title: "Bag reports | H2H Express",
};

export default function BagReportsPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <BagsReport />
    </main>
  );
}
