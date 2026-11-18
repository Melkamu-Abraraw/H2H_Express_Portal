import { BagDetail } from "@/components/admin/bag-detail";

// Bag references are only known when the page is opened, and the admin layout reads the URL
// (sidebar, page transition), so this page renders on request instead of from a static shell.
export const instant = false;

export const metadata = {
  title: "Bag | H2H Express",
};

export default async function BagPage({ params }) {
  const { code } = await params;
  const bagCode = decodeURIComponent(code).toUpperCase();
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <BagDetail key={bagCode} code={bagCode} />
    </main>
  );
}
