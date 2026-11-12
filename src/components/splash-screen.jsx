"use client";

import { useEffect, useState } from "react";
import { VanLoader } from "@/components/van-loader";

// Long enough for the van to drive in, short enough not to slow anyone down.
const MIN_VISIBLE_MS = 1200;
const FADE_MS = 400;

// Part of the server HTML, so it covers the page from the very first paint of a full load.
// Client-side navigation keeps the root layout mounted, so it never shows again until a reload.
export function SplashScreen() {
  const [phase, setPhase] = useState("shown");

  useEffect(() => {
    // performance.now() counts from the start of the page load, so slow loads don't wait twice.
    const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
    const leave = setTimeout(() => setPhase("leaving"), wait);
    const remove = setTimeout(() => setPhase("gone"), wait + FADE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(remove);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      className={`fixed inset-0 z-100 grid place-items-center bg-background transition-opacity duration-400 ${
        phase === "leaving" ? "pointer-events-none opacity-0" : ""
      }`}
    >
      <VanLoader
        preload
        label={
          <>
            <span className="text-brand">H2H</span> Express
          </>
        }
        detail="Getting your packages ready…"
      />
    </div>
  );
}
