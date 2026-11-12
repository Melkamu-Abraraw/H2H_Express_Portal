"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { VanImage } from "@/components/van-loader";

const START_MS = 2500;
const ARRIVE_MS = 450;
const ACROSS_MS = 700;
// Gives up if a navigation never finishes (cancelled, or the same page).
const GIVE_UP_MS = 8000;

function reducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isInternalNavigation(event) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  const link = event.target.closest?.("a[href]");
  if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) {
    return false;
  }
  const url = new URL(link.href, location.href);
  return url.origin === location.origin && url.pathname !== location.pathname;
}

// Runs one animation on the van, replacing whatever it was doing.
function drive(van, running, frames, options) {
  running.current?.cancel();
  const animation = van.current.animate(frames, { fill: "forwards", ...options });
  running.current = animation;
  return animation;
}

// A van drives along the header's bottom line carrying the package to the next page:
// it sets off when a link is clicked and speeds off the edge once the new page is showing.
export function RouteTransition() {
  const pathname = usePathname();
  const [shownPath, setShownPath] = useState(pathname);
  const [trip, setTrip] = useState(0);
  const van = useRef(null);
  const running = useRef(null);

  // A new page arrived (link click or back/forward): note it while rendering, not in an effect.
  if (pathname !== shownPath) {
    setShownPath(pathname);
    setTrip((current) => current + 1);
  }

  // Set off as soon as a link is clicked. Capture phase: <Link> cancels the click event itself.
  useEffect(() => {
    let giveUp;
    function onClick(event) {
      if (!isInternalNavigation(event) || reducedMotion() || !van.current) return;
      const width = van.current.parentElement.clientWidth;
      drive(
        van,
        running,
        [
          { transform: "translateX(-100%)", opacity: 1 },
          { transform: `translateX(${width * 0.7}px)`, opacity: 1 },
        ],
        { duration: START_MS, easing: "cubic-bezier(0.1, 0.7, 0.3, 1)" },
      );
      clearTimeout(giveUp);
      giveUp = setTimeout(() => running.current?.cancel(), GIVE_UP_MS);
    }
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimeout(giveUp);
    };
  }, []);

  // Deliver: drive off the right edge from wherever the van is now.
  useEffect(() => {
    if (trip === 0 || reducedMotion() || !van.current) return;
    const width = van.current.parentElement.clientWidth;
    // Still driving, or parked mid-way waiting for a slow page ("idle" means cancelled).
    const onTheWay = Boolean(running.current) && running.current.playState !== "idle";
    const from = onTheWay ? getComputedStyle(van.current).transform : "translateX(-100%)";
    const delivery = drive(
      van,
      running,
      [
        { transform: from, opacity: 1 },
        { transform: `translateX(${width + 40}px)`, opacity: 1 },
      ],
      { duration: onTheWay ? ARRIVE_MS : ACROSS_MS, easing: "cubic-bezier(0.5, 0, 0.8, 0.6)" },
    );
    delivery.finished.then(() => delivery.cancel()).catch(() => {});
  }, [trip]);

  return (
    // Sits inside the sticky header, so the van rides on its bottom border over the page area only.
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 h-5 overflow-hidden"
      aria-hidden="true"
    >
      {/* Hidden until animated: an animation with fill "forwards" places it, cancelling hides it. */}
      <div ref={van} className="absolute bottom-0 left-0 w-8 opacity-0">
        <span className="absolute right-[90%] bottom-0 h-0.5 w-screen rounded-full bg-brand" />
        <VanImage />
      </div>
    </div>
  );
}
