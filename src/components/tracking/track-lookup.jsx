"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Search } from "lucide-react";
import { TRACKING_FORMAT } from "@/components/tracking/tracking-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TrackLookup({ compact = false }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [going, setGoing] = useState(false);

  function submit(event) {
    event.preventDefault();
    // Accept "h2h caet 008421" and similar, the way people type it from a receipt.
    const number = value.trim().toUpperCase().replace(/[\s_]+/g, "-");
    if (!TRACKING_FORMAT.test(number)) {
      setError("That doesn't look like a tracking number. It should look like H2H-CAET-008421.");
      return;
    }
    setError("");
    setGoing(true);
    router.push(`/track/${number}`);
  }

  // 16px text keeps phones from zooming into the field; 48px controls are easy to tap.
  const height = compact ? "h-11" : "h-12";

  return (
    <form onSubmit={submit} noValidate className="grid w-full gap-2" role="search">
      <label
        htmlFor="tracking-number"
        className={compact ? "sr-only" : "text-sm font-medium text-brand-dark dark:text-brand"}
      >
        Tracking number
      </label>
      <div className={`flex gap-2 ${compact ? "" : "flex-col sm:flex-row"}`}>
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-brand-dark"
            aria-hidden="true"
          />
          <Input
            id="tracking-number"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError("");
              setGoing(false);
            }}
            placeholder="H2H-CAET-008421"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className={`${height} rounded-md pl-10 font-mono focus-visible:border-brand-dark focus-visible:ring-brand/40 text-base uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal md:text-base`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "tracking-number-error" : undefined}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={going}
          aria-label={compact ? "Track" : undefined}
          className={`group ${height} shrink-0 gap-1 rounded-md bg-[#2c3654] text-[15px] font-semibold text-white hover:bg-[#3a4566] dark:bg-white dark:text-[#141a2e] dark:hover:bg-white/90 ${
            compact ? "w-11 px-0 sm:w-auto sm:pr-3 sm:pl-4" : "w-full px-5 sm:w-auto sm:pr-3"
          }`}
        >
          <span className={compact ? "sr-only sm:not-sr-only" : undefined}>Track</span>
          <span
            className="text-brand transition-transform duration-200 group-hover:translate-x-0.5 group-active:translate-x-1 dark:text-brand-dark"
            aria-hidden="true"
          >
            {going ? (
              <LoaderCircle className="size-4 animate-spin" strokeWidth={2.5} />
            ) : (
              <ArrowRight className="size-4" strokeWidth={2.5} />
            )}
          </span>
        </Button>
      </div>
      {error && (
        <p id="tracking-number-error" className="text-sm text-status-bad">
          {error}
        </p>
      )}
    </form>
  );
}
