import { SettingsView } from "@/components/admin/settings-view";

export const metadata = {
  title: "Settings | H2H Express",
};

export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your business details, package rules and how the portal looks.
        </p>
      </div>
      <SettingsView />
    </main>
  );
}
