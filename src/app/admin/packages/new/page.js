import { Suspense } from "react";
import { customerPrefill } from "@/lib/server/customers";
import { NewPackageForm } from "@/components/admin/new-package-form";

export const metadata = {
  title: "Register package | H2H Express",
};

const single = (value) => (typeof value === "string" ? value : undefined);

export default function NewPackagePage({ searchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Register package</h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Fill in the details below. Tracked from drop-off to collection.
        </p>
      </div>
      {/* ?customer= starts the form for an existing customer; the blank form is the static shell. */}
      <Suspense fallback={<NewPackageForm />}>
        {searchParams.then(async ({ customer, receiver }) => (
          <NewPackageForm
            key={`${single(customer)}|${single(receiver)}`}
            prefill={await customerPrefill(single(customer), single(receiver)).catch(() => null)}
          />
        ))}
      </Suspense>
    </main>
  );
}
