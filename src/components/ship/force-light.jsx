"use client";

import { useLayoutEffect } from "react";

// The public form is always light, whatever the visitor's device or saved theme says.
// The admin keeps its own theme setting: it is put back when leaving this page.
export function ForceLight() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => root.classList.toggle("dark", wasDark);
  }, []);
  return null;
}
