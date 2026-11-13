"use client";

import { useSyncExternalStore } from "react";
import { useRoutes } from "@/components/admin/routes-store";
import { Map, MapArc, MapMarker, MarkerContent } from "@/components/ui/map";

// Hubs by airport code, as [longitude, latitude]. Routes through other airports are left off the map.
const HUBS = {
  YYZ: { name: "Toronto", at: [-79.3832, 43.6532], side: "bottom" },
  ADD: { name: "Addis Ababa", at: [38.7578, 8.9806], side: "right" },
  EBB: { name: "Kampala", at: [32.5825, 0.3476], side: "bottom" },
};

const GOLD = "#dca528";

// This app marks dark mode with a "dark" class on <html> and nothing for light mode. The map would
// then follow the device setting instead, giving a dark map under dark text in light mode.
function subscribe(callback) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const isDark = () => document.documentElement.classList.contains("dark");
const SIDE = {
  bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
  right: "top-1/2 left-full ml-2 -translate-y-1/2",
};

// A quiet world map: one gold arc per route and a dot at each city.
export function RoutesMap() {
  const routes = useRoutes();
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const drawn = routes
    .filter((route) => HUBS[route.depart] && HUBS[route.arrive])
    .map((route) => ({ id: route.code, from: HUBS[route.depart].at, to: HUBS[route.arrive].at }));
  // A route and its reverse would sit on top of each other, so the reverse bows the other way.
  const reverse = (arc) => drawn.some((other) => other.from === arc.to && other.to === arc.from);
  const outbound = drawn.filter((arc) => !reverse(arc) || arc.from[0] < arc.to[0]);
  const back = drawn.filter((arc) => !outbound.includes(arc));
  const cities = Object.values(HUBS).filter((hub) =>
    drawn.some((arc) => arc.from === hub.at || arc.to === hub.at),
  );

  return (
    <div className="h-72 overflow-hidden rounded-lg border sm:h-96" role="img" aria-label="Map of the shipping routes">
      <Map
        theme={dark ? "dark" : "light"}
        // Fit all three cities with room around them, whatever the width of the page.
        bounds={[
          [-85, -3],
          [45, 49],
        ]}
        fitBoundsOptions={{ padding: { top: 36, bottom: 44, left: 40, right: 70 } }}
        minZoom={0.4}
        scrollZoom={false}
        dragRotate={false}
        touchZoomRotate={false}
        attributionControl={{ compact: true }}
      >
        <MapArc data={outbound} curvature={0.25} paint={{ "line-color": GOLD, "line-width": 2, "line-opacity": 0.9 }} interactive={false} />
        {back.length > 0 && (
          <MapArc
            data={back}
            curvature={-0.25}
            paint={{ "line-color": GOLD, "line-width": 2, "line-opacity": 0.6, "line-dasharray": [2, 2] }}
            interactive={false}
          />
        )}
        {cities.map((city) => (
          <MapMarker key={city.name} longitude={city.at[0]} latitude={city.at[1]}>
            <MarkerContent>
              <div className="size-2.5 rounded-full bg-brand ring-4 ring-brand/25" />
              {/* Halo in the page colour keeps the name readable over land and sea. */}
              <span
                className={`absolute text-xs font-medium whitespace-nowrap text-foreground [text-shadow:0_0_3px_var(--background),0_0_6px_var(--background)] ${SIDE[city.side]}`}
              >
                {city.name}
              </span>
            </MarkerContent>
          </MapMarker>
        ))}
      </Map>
    </div>
  );
}
