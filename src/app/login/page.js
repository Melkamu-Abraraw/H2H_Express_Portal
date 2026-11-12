import Image from "next/image";
import CA from "country-flag-icons/react/3x2/CA";
import ET from "country-flag-icons/react/3x2/ET";
import UG from "country-flag-icons/react/3x2/UG";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = {
  title: "Sign in | H2H Express",
  description: "Sign in to the H2H Express portal.",
};

// TODO: replace with the real support WhatsApp number (digits only, with country code).
const SUPPORT_WHATSAPP = "https://wa.me/10000000000";

const COUNTRIES = [
  ["Canada", CA],
  ["Ethiopia", ET],
  ["Uganda", UG],
];

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
      <section className="relative z-10 flex flex-col px-4 py-8 sm:px-6 lg:order-2">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
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
              <p className="text-xs font-medium tracking-[0.3em] text-muted-foreground uppercase">
                Delivery
              </p>
            </div>
          </div>

          <h1 className="mt-12 text-3xl font-semibold tracking-tight sm:text-4xl">Sign in</h1>
          <div className="mt-3 h-1 w-11 rounded-full bg-brand" aria-hidden="true" />
          <p className="mt-5 text-muted-foreground">Welcome back. Sign in to manage packages, payments and deliveries.</p>

          <LoginForm />
        </div>

        <footer className="mx-auto mt-10 flex w-full max-w-md flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground sm:text-sm">
          <span>© 2026 H2H Express Delivery</span>
          <span>
            Support:{" "}
            <a
              href={SUPPORT_WHATSAPP}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-dark underline-offset-4 hover:underline dark:text-brand"
            >
              WhatsApp
            </a>{" "}
            · v1.0
          </span>
        </footer>
      </section>

      {/* The right edge runs on a slant into the form column. */}
      <section className="relative hidden overflow-hidden bg-[#141a2e] [clip-path:polygon(0_0,100%_0,70%_100%,0_100%)] lg:order-1 lg:block">
        <Image
          src="/login_side.jpg"
          alt="An H2H Express courier handing a package to a customer at her door"
          fill
          sizes="55vw"
          preload
          className="origin-top-left scale-90 object-cover object-[50%_22%]"
        />
        {/* Navy under the copy so it stays readable over the photo. */}
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-[#141a2e] via-[#141a2e]/80 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 pr-[26%] pb-8 pl-10 text-white xl:pl-12">
          <div className="h-1 w-11 rounded-full bg-brand" aria-hidden="true" />
          <h2 className="mt-4 text-3xl font-semibold tracking-tight 2xl:text-4xl">
            Every package, <span className="text-brand">in safe hands</span>
          </h2>
          <p className="mt-3 max-w-md text-sm text-white/85 2xl:text-base">
            From drop-off to doorstep, register parcels, record payments and keep customers updated on every shipment.
          </p>
          <ul className="mt-5 inline-flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-white/25 bg-white/10 px-5 py-2.5 backdrop-blur-sm">
            {COUNTRIES.map(([name, Flag]) => (
              <li key={name} className="flex items-center gap-2 text-sm font-medium">
                <Flag className="h-3 w-[18px] rounded-[2px]" aria-hidden="true" />
                {name}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
