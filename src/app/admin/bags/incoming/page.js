import { BagsIncoming } from "@/components/admin/bags-incoming";

export const metadata = {
  title: "Incoming bags | H2H Express",
};

export default function IncomingBagsPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <BagsIncoming />
    </main>
  );
}
