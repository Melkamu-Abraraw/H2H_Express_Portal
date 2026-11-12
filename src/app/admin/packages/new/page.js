import { Suspense } from "react";
import { customerPrefill } from "@/lib/server/customers";
import { getDb } from "@/lib/server/mongodb";
import { requestPrefill } from "@/lib/server/requests";
import { NewPackageForm } from "@/components/admin/new-package-form";

export const metadata = {
  title: "Register package | H2H Express",
};

const single = (value) => (typeof value === "string" ? value : undefined);

// ?request= starts the form from a public-page request waiting for review.
async function fromRequest(code) {
  const request = await requestPrefill(await getDb(), code).catch(() => null);
  if (!request) return null;
  return {
    requestCode: request.code,
    direction: request.route,
    branchCode: request.branch.code,
    shipping: request.shipping,
    sender: request.sender,
    savedReceivers: [{ ...request.receiver, route: request.route }],
    receiverName: request.receiver.name,
    items: request.items,
    notes: request.notes,
    photos: request.photos,
  };
}

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
        {searchParams.then(async ({ customer, receiver, request }) => (
          <NewPackageForm
            key={`${single(customer)}|${single(receiver)}|${single(request)}`}
            prefill={
              single(request)
                ? await fromRequest(single(request))
                : await customerPrefill(single(customer), single(receiver)).catch(() => null)
            }
          />
        ))}
      </Suspense>
    </main>
  );
}
