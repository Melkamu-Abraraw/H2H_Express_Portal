import Image from "next/image";
import { ActivateForm } from "@/components/auth/activate-form";

export const metadata = {
  title: "Activate your account | H2H Express",
  description: "Set your password to start using the H2H Express portal.",
  // The invitation token is in this page's URL; never pass it on to other sites.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function ActivatePage() {
  return (
    <main className="grid min-h-dvh bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center">
        <div className="flex items-center justify-center gap-3">
          <Image
            src="/images/logos/logo_header.png"
            alt="H2H Express logo"
            width={463}
            height={259}
            loading="eager"
            className="h-auto w-14"
          />
          <div className="leading-tight">
            <p className="text-xl font-semibold tracking-tight">
              H2H <span className="text-brand-dark dark:text-brand">Express</span>
            </p>
            <p className="text-xs font-medium tracking-[0.3em] text-muted-foreground uppercase">Delivery</p>
          </div>
        </div>

        <h1 className="mt-12 text-3xl font-semibold tracking-tight sm:text-4xl">Activate your account</h1>
        <div className="mt-3 h-1 w-11 rounded-full bg-brand" aria-hidden="true" />

        <ActivateForm />
      </div>
    </main>
  );
}
