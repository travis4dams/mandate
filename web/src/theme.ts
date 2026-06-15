// Shared design tokens for the MANDATE web UI (SPEC-WEB-11).
// One source of truth for the "Office of the Chair" aesthetic — an institutional
// Federal-Reserve register: deep navy authority, brass/gold accent, warm
// parchment surfaces, an engraved serif for display + a clean sans for data.
// Components import from here; no magic colors scattered across the tree.
//
// Fonts are system stacks on purpose — no network font dependency, so the look
// is deterministic and works under vitest-jsdom and offline.

import type { CSSProperties } from "react";

export const color = {
  // Core institutional palette.
  navy: "#0f2742", // deep authority — headers, primary chrome
  navyDeep: "#0a1c30", // near-black navy — top bar, footers
  navyMute: "#1c3a5e", // raised navy surfaces
  brass: "#b08d4f", // brass/gold accent — seals, active states, key figures
  brassBright: "#d4b06a", // hover/active brass
  parchment: "#f6f1e7", // warm page background
  parchmentRaised: "#fffdf8", // cards/panels on parchment
  ink: "#23262b", // primary body text on light surfaces
  inkSoft: "#5c5852", // secondary text on light surfaces
  line: "#d8cfbd", // hairline borders on parchment
  lineStrong: "#bcae93",

  // Text on dark navy chrome.
  onNavy: "#eef2f7",
  onNavySoft: "#9fb3c8",

  // Semantic status (kept muted/official, not neon).
  positive: "#2f6b46", // on-target / healthy
  positiveSoft: "#e6efe7",
  negative: "#9e2b25", // off-target / at-risk
  negativeSoft: "#f6e9e6",
  caution: "#8a6d1f",
  cautionSoft: "#f3ecd8",
} as const;

export const font = {
  // Engraved/official display face for headings and figures of consequence.
  display: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif`,
  // Clean, legible sans for data, controls, and dense readouts.
  sans: `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
  // Tabular monospace for rates and ledger-like numbers.
  mono: `"SF Mono", "JetBrains Mono", "Roboto Mono", ui-monospace, "Courier New", monospace`,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 36,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
} as const;

export const shadow = {
  card: "0 1px 2px rgba(15, 39, 66, 0.06), 0 4px 14px rgba(15, 39, 66, 0.08)",
  raised: "0 6px 24px rgba(10, 28, 48, 0.18)",
  inset: "inset 0 1px 0 rgba(255,255,255,0.6)",
} as const;

// ---- Reusable style fragments (plain CSSProperties) ----
// Importing these keeps the redesign coherent and the components terse.

export const surface = {
  page: {
    background: `radial-gradient(120% 80% at 50% -10%, #fbf7ee 0%, ${color.parchment} 55%, #efe7d6 100%)`,
    minHeight: "100vh",
    color: color.ink,
    fontFamily: font.sans,
  },
  card: {
    background: color.parchmentRaised,
    border: `1px solid ${color.line}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    padding: `${space.lg}px ${space.lg}px`,
  },
} as const satisfies Record<string, CSSProperties>;

export const heading = {
  display: {
    fontFamily: font.display,
    color: color.navy,
    letterSpacing: "0.01em",
    margin: 0,
  },
  // Small uppercase label, the engraved "section marker" look.
  label: {
    fontFamily: font.sans,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: color.inkSoft,
  },
} as const satisfies Record<string, CSSProperties>;

// Primary (brass) and secondary (navy outline) button styles.
export function buttonStyle(variant: "primary" | "secondary" | "ghost" = "secondary"): CSSProperties {
  const base: CSSProperties = {
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 600,
    padding: `${space.sm}px ${space.md}px`,
    borderRadius: radius.sm,
    cursor: "pointer",
    transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
  };
  if (variant === "primary") {
    return { ...base, background: color.brass, color: "#fffdf8", border: `1px solid ${color.brass}` };
  }
  if (variant === "ghost") {
    return { ...base, background: "transparent", color: color.navy, border: "1px solid transparent" };
  }
  return { ...base, background: "transparent", color: color.navy, border: `1px solid ${color.lineStrong}` };
}

// A semantic chip (on-target / off-target / neutral) used for status readouts.
export function chipStyle(tone: "positive" | "negative" | "caution" | "neutral"): CSSProperties {
  const map = {
    positive: { fg: color.positive, bg: color.positiveSoft, bd: "#bcd6c2" },
    negative: { fg: color.negative, bg: color.negativeSoft, bd: "#e3c5c0" },
    caution: { fg: color.caution, bg: color.cautionSoft, bd: "#e0d2a6" },
    neutral: { fg: color.inkSoft, bg: "#efece4", bd: color.line },
  } as const;
  const t = map[tone];
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: t.fg,
    background: t.bg,
    border: `1px solid ${t.bd}`,
    borderRadius: 999,
    padding: `2px ${space.sm}px`,
  };
}
