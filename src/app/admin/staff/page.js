import { StaffView } from "@/components/admin/staff-view";

export const metadata = {
  title: "Staff | H2H Express",
};

export default function StaffPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-sm text-muted-foreground">
          Who works at each branch and what they can do in the portal.
        </p>
      </div>
      <StaffView />
    </main>
  );
}
