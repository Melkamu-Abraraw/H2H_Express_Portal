import { ForceLight } from "@/components/ship/force-light";
import { ShipExperience } from "@/components/ship/ship-form";

export const metadata = {
  title: "Send a package | Hand to Hand Express",
  description:
    "Fill in your details below — every step is tracked from drop-off to collection, with live updates by email.",
};

export default function ShipPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      {/* Runs while the page loads so there is no dark flash before the component below takes over. */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.remove('dark')" }} />
      <ForceLight />
      <main className="mx-auto grid w-full max-w-3xl flex-1 content-start gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <ShipExperience
          intro={
            <div className="max-w-2xl">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Send a package</h1>
              <p className="mt-2 text-[15px] text-muted-foreground">
                Fill in your details below — every step is tracked from drop-off to collection, with
                live updates by email.
              </p>
            </div>
          }
        />
      </main>
    </div>
  );
}
