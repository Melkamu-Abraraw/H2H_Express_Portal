import { VanLoader } from "@/components/van-loader";

// Shown while a page that needs fresh data (e.g. registering for a customer) is on its way.
export default function AdminLoading() {
  return (
    <main className="grid flex-1 place-items-center p-6">
      <VanLoader size="w-32" label="On its way" detail="Loading this page…" />
    </main>
  );
}
