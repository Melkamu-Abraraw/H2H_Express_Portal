import Image from "next/image";
import { Check, Mail, Phone } from "lucide-react";
import { RequestDeliveryButton, ShipForm } from "@/components/ship/ship-form";

export const metadata = {
  title: "Send a package | Hand to Hand Express",
  description:
    "Fill in your details below — every step is tracked from drop-off to collection, with live updates by email.",
};

const REASONS = [
  "Same-day delivery — no overnight holds",
  "Live tracking from drop-off to collection",
  "Every package handled with care",
  "24/7 support, real people answer",
];

const NUMBERS = [
  ["10K+", "Deliveries"],
  ["24/7", "Support"],
  ["20+", "Cities"],
];

function Panel({ title, children }) {
  return (
    <section className="grid gap-3 rounded-lg border bg-card p-5 shadow-xs">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function ShipPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/images/logos/h2h_mark.png"
              alt="H2H"
              width={195}
              height={138}
              preload
              className="h-auto w-8 shrink-0 dark:hidden"
            />
            <Image
              src="/images/logos/logo_header.png"
              alt="H2H"
              width={463}
              height={259}
              className="hidden h-auto w-8 shrink-0 dark:block"
            />
            <div className="grid min-w-0 leading-tight">
              <span className="truncate text-sm font-semibold">Hand to Hand Express</span>
              <span className="truncate text-xs text-muted-foreground">Canada ↔ Ethiopia courier</span>
            </div>
          </div>
          <RequestDeliveryButton />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Send a package</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Fill in your details below — every step is tracked from drop-off to collection, with
            live updates by email.
          </p>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
          <ShipForm />

          <aside className="grid gap-4 lg:sticky lg:top-20">
            <Panel title="Why ship with H2H">
              <ul className="grid gap-2.5">
                {REASONS.map((reason) => (
                  <li key={reason} className="flex gap-2.5 text-sm">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-brand-dark dark:text-brand"
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                    {reason}
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="By the numbers">
              <dl className="grid grid-cols-3 divide-x rounded-md bg-muted/50 text-center">
                {NUMBERS.map(([value, label]) => (
                  <div key={label} className="px-2 py-3">
                    <dt className="sr-only">{label}</dt>
                    <dd className="font-mono text-lg font-semibold text-brand-dark dark:text-brand">
                      {value}
                    </dd>
                    <dd className="text-xs text-muted-foreground">{label}</dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <Panel title="Need help?">
              <div className="grid gap-2 text-sm">
                <a
                  href="tel:+14379977533"
                  className="flex min-h-10 items-center gap-2.5 rounded-md px-1 hover:text-brand-dark focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Phone className="size-4 text-brand-dark dark:text-brand" aria-hidden="true" />
                  +1 437 997 7533
                </a>
                <a
                  href="mailto:h2hexp2025@gmail.com"
                  className="flex min-h-10 items-center gap-2.5 rounded-md px-1 break-all hover:text-brand-dark focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Mail className="size-4 shrink-0 text-brand-dark dark:text-brand" aria-hidden="true" />
                  h2hexp2025@gmail.com
                </a>
              </div>
            </Panel>
          </aside>
        </div>
      </main>
    </div>
  );
}
