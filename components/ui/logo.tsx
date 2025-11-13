"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

const DEFAULT_LOGO_SRC = "/toasty_task_filled_css-v2.svg";

type LogoColors = {
  bg?: string;
  line?: string;
  toast?: string;
  check?: string;
};

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
  src?: string;
  colors?: LogoColors;
  ariaLabel?: string;
}

type LogoStyleVars = CSSProperties & {
  "--logo-bg"?: string;
  "--logo-line"?: string;
  "--logo-toast"?: string;
  "--logo-check"?: string;
};

const svgCache = new Map<string, string>();

const FALLBACK_ARIA_LABEL = "Toasty Task logo";

/**
 * Toasty Task Logo Component
 *
 * Loads an external SVG file, injects the appropriate classes/attributes,
 * and maps CSS custom properties so we can reuse the same React component
 * across future logo variants (single path or split toast/check paths).
 */
export function Logo({
  width = 40,
  height = 40,
  className,
  src = DEFAULT_LOGO_SRC,
  colors,
  ariaLabel = FALLBACK_ARIA_LABEL,
}: LogoProps) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(() => svgCache.get(src) ?? null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSvg() {
      if (svgCache.has(src)) {
        setSvgMarkup(svgCache.get(src)!);
        return;
      }

      try {
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`Failed to load logo asset: ${response.status} ${response.statusText}`);
        }
        const text = await response.text();
        svgCache.set(src, text);
        if (!cancelled) {
          setSvgMarkup(text);
        }
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setSvgMarkup(null);
        }
      }
    }

    setLoadError(false);
    loadSvg();

    return () => {
      cancelled = true;
    };
  }, [src]);

  const svgStyleAttr = "--bg: var(--logo-bg); --toast: var(--logo-toast); --check: var(--logo-check); --line: var(--logo-line);";

  const processedSvg = useMemo(() => {
    if (!svgMarkup) {
      return null;
    }

    const sanitizedMarkup = stripSvgTitles(svgMarkup);

    return setSvgAttributes(sanitizedMarkup, {
      "class": cn("logo-svg", className),
      width: width?.toString(),
      height: height?.toString(),
      role: "img",
      "aria-label": ariaLabel,
      focusable: "false",
      style: svgStyleAttr,
    });
  }, [ariaLabel, className, height, svgMarkup, width]);

  const logoStyle: LogoStyleVars = {
    width,
    height,
    "--logo-bg": colors?.bg,
    "--logo-line": colors?.line,
    "--logo-toast": colors?.toast ?? colors?.line,
    "--logo-check": colors?.check ?? colors?.line,
  };

  if (loadError) {
    return (
      <span
        className={cn("logo-svg flex items-center justify-center font-semibold uppercase", className)}
        style={logoStyle}
        aria-label={`${ariaLabel} (unavailable)`}
      >
        TT
      </span>
    );
  }

  if (!processedSvg) {
    return (
      <span
        className={cn("logo-placeholder inline-flex animate-pulse rounded-full bg-muted", className)}
        style={logoStyle}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className="logo-wrapper inline-flex"
      style={logoStyle}
      dangerouslySetInnerHTML={{ __html: processedSvg }}
    />
  );
}

function setSvgAttributes(markup: string, attributes: Record<string, string | undefined>) {
  let updatedMarkup = markup;

  Object.entries(attributes).forEach(([key, value]) => {
    if (value) {
      const attrRegex = new RegExp(`\\s${key}="[^"]*"`, "i");
      updatedMarkup = updatedMarkup.replace(attrRegex, "");
    }
  });

  const attributeString = Object.entries(attributes)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");

  if (!attributeString) {
    return updatedMarkup;
  }

  return updatedMarkup.replace(/<svg\b/, `<svg ${attributeString}`);
}

function stripSvgTitles(markup: string) {
  return markup.replace(/<title[\s\S]*?<\/title>/gi, "");
}
