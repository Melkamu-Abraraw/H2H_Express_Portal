import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TrackingCard } from "@/components/tracking/tracking-card";
import { TrackLookup } from "@/components/tracking/track-lookup";
import { trackingNumbers } from "@/components/tracking/public-tracking";
import { findPublicTracking } from "@/lib/server/tracking";

// Sample packages are prerendered; real ones are looked up in the database on each visit.
export function generateStaticParams() {
  return trackingNumbers().map((tracking) => ({ tracking }));
}

export async function generateMetadata({ params }) {
  const { tracking } = await params;
  const info = await findPublicTracking(decodeURIComponent(tracking));
  return { title: info ? `${info.title} · ${info.tracking} | H2H Express` : "Package not found" };
}

async function Tracking({ params }) {
  const { tracking } = await params;
  const info = await findPublicTracking(decodeURIComponent(tracking));
  if (!info) notFound();
  return <TrackingCard info={info} />;
}

function TrackingSkeleton() {
  return (
    <div
      className="h-80 animate-pulse rounded-lg border bg-card lg:max-w-[calc(100%-380px)]"
      aria-label="Loading package"
    />
  );
}

export default function TrackingPage({ params }) {
  return (
    <>
      <Suspense fallback={<TrackingSkeleton />}>
        <Tracking params={params} />
      </Suspense>
      <section className="grid gap-2 lg:max-w-[calc(100%-380px)]">
        <h2 className="text-sm font-medium text-muted-foreground">Track another package</h2>
        <TrackLookup compact />
      </section>
    </>
  );
}
