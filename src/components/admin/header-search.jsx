"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

// Tracking numbers look like H2H-ET-000123 (or a partial such as "H2H-ET" / "ET-0001").
const TRACKING_LIKE = /^h2h(-|$)|^[a-z0-9]{2,12}-\d{3,6}$/i;

// Header search: a tracking number opens Packages, anything else (a name) opens Customers. ⌘K / Ctrl+K focuses it.
export function HeaderSearch() {
  const router = useRouter();
  const inputRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onSubmit = (event) => {
    event.preventDefault();
    const q = inputRef.current?.value.trim().slice(0, 60) ?? "";
    if (!q) return;
    const section = TRACKING_LIKE.test(q) ? "packages" : "customers";
    router.push(`/admin/${section}?q=${encodeURIComponent(q)}`);
  };

  return (
    <form onSubmit={onSubmit} role="search" className="relative hidden w-full max-w-xs sm:block">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        type="search"
        placeholder="Search tracking # or customer name..."
        aria-label="Search by tracking number or customer name"
        className="pr-11 pl-8"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">
        ⌘K
      </kbd>
    </form>
  );
}
