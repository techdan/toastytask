"use client";

import { useEffect, useState } from "react";

type Breakpoint = "mobile" | "tablet" | "desktop";

const MOBILE_MAX = 639;
const TABLET_MAX = 1023;

const resolveBreakpoint = (width: number): Breakpoint => {
  if (width <= MOBILE_MAX) return "mobile";
  if (width <= TABLET_MAX) return "tablet";
  return "desktop";
};

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setBreakpoint((current) => {
        const next = resolveBreakpoint(window.innerWidth);
        return current === next ? current : next;
      });
    };

    // Sync once on mount in case SSR default differs from client width.
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return breakpoint;
}
