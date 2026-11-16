import { AccountView } from "@/components/admin/account-view";

export const metadata = {
  title: "My account | H2H Express",
};

export default function AccountPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My account</h1>
        <p className="text-sm text-muted-foreground">Your name, photo and password.</p>
      </div>
      <AccountView />
    </main>
  );
}
