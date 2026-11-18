"use client";

import { format } from "date-fns";
import { stepsFor } from "@/components/admin/package-tracking";
import { HISTORY_LABELS } from "@/lib/bags";

// Steps from the earlier six-step flow, still shown as they happened.
const OLD_STEPS = { arrived: "Arrived at destination", customs: "Cleared customs" };

const TONES = {
  missing: "bg-status-bad",
  damaged: "bg-status-warn",
  lost: "bg-status-bad",
};

// Everything that happened to a package, oldest first: its tracking steps plus bag activity
// (added to a bag, dispatched with it, missing when it was opened...). Read-only, newest last.
export function packageActivity(pkg) {
  const labels = Object.fromEntries(stepsFor(pkg).map((step) => [step.key, step.label]));
  const steps = (pkg.events ?? []).map((event, index) => ({
    key: `e${index}`,
    at: new Date(event.date),
    label: index === 0 ? `Registered · ${labels[event.step] ?? event.step}` : (labels[event.step] ?? OLD_STEPS[event.step] ?? event.step),
    by: event.by,
    bag: event.bag,
    dot: "bg-status-good",
  }));
  const history = (pkg.history ?? []).map((entry, index) => ({
    key: `h${index}`,
    at: new Date(entry.at),
    label: HISTORY_LABELS[entry.type] ?? entry.type,
    by: entry.by,
    bag: entry.bag,
    notes: entry.notes,
    dot: TONES[entry.type] ?? "bg-muted-foreground/60",
  }));
  // Step events and bag entries written in the same moment: show the bag entry first.
  return [...history, ...steps].sort((a, b) => a.at - b.at);
}

export function PackageHistory({ pkg, className = "" }) {
  const rows = packageActivity(pkg);
  if (!rows.length) return <p className="text-sm text-muted-foreground">No history yet.</p>;
  return (
    <ol className={`flex flex-col ${className}`} aria-label={`History of ${pkg.tracking}`}>
      {rows.map((row, index) => (
        <li key={row.key} className="relative flex gap-3 pb-3 last:pb-0">
          {index < rows.length - 1 && (
            <span className="absolute top-3 left-[4.5px] h-full w-px bg-muted-foreground/30" aria-hidden="true" />
          )}
          <span className={`relative mt-1.5 size-2.5 shrink-0 rounded-full ${row.dot}`} aria-hidden="true" />
          <div className="flex min-w-0 flex-col text-sm">
            <span>
              {row.label}
              {row.bag && <span className="font-mono text-xs text-muted-foreground"> · {row.bag}</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              {format(row.at, "MMM d, yyyy HH:mm")}
              {row.by ? ` · ${row.by}` : ""}
            </span>
            {row.notes && <span className="text-xs break-words text-muted-foreground italic">{row.notes}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
