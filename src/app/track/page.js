import { TrackLookup } from "@/components/tracking/track-lookup";
import { VanImage } from "@/components/van-loader";

export default function TrackPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 pt-4 sm:justify-center sm:gap-8 sm:pt-0 sm:pb-12">
      <div className="text-center">
        <div className="van-drive-in mx-auto mb-4 w-24 sm:w-28">
          <VanImage className="van-bob" preload />
          <div className="van-road mx-auto mt-1 h-1 w-[130%] -translate-x-[11.5%] rounded-full opacity-80 [--road-color:rgb(var(--brand))]" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Track your package
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the number on your{" "}
          <span className="font-medium text-brand-dark dark:text-brand">receipt</span>.
        </p>
      </div>
      <div className="rounded-lg border bg-card p-4 shadow-xs sm:p-5">
        <TrackLookup />
      </div>
    </div>
  );
}
