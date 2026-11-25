import { BagsView } from "@/components/admin/bags-view";

export const metadata = {
  title: "Boxes | H2H Express",
};

export default function BagsPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <BagsView />
    </main>
  );
}
