/**
 * CONNECT PREMIUM DESIGN TOKENS (TypeScript Definition)
 * Managed by Agent A26 (Wave 3)
 */

export const colors = {
  dark: {
    bg: "#09090b",
    bgSubtle: "#0d0d11",
    surface1: "#121216",
    surface2: "#18181e",
    surface3: "#22222a",
    surfaceHover: "#1f1f26",
    surfaceActive: "#272732",
    surfaceGlass: "rgba(18, 18, 22, 0.75)",
    border: "rgba(255, 255, 255, 0.08)",
    borderSubtle: "rgba(255, 255, 255, 0.04)",
    borderStrong: "rgba(255, 255, 255, 0.16)",
    borderFocus: "rgba(56, 189, 248, 0.65)",
    borderHover: "rgba(255, 255, 255, 0.12)",
    text1: "#ededef",
    text2: "#a1a1aa",
    text3: "#71717a",
    textDim: "#52525b",
    textOnAccent: "#09090b",
    accent: "#38bdf8",
    accentHover: "#0ea5e9",
    accentActive: "#0284c7",
    accentSubtle: "rgba(56, 189, 248, 0.12)",
    accentGlow: "0 0 24px rgba(56, 189, 248, 0.22)",
    danger: "#f87171",
    dangerHover: "#ef4444",
    dangerSubtle: "rgba(248, 113, 113, 0.12)",
    success: "#34d399",
    successHover: "#10b981",
    successSubtle: "rgba(52, 211, 153, 0.12)",
    warning: "#fbbf24",
    warningHover: "#f59e0b",
    warningSubtle: "rgba(251, 191, 36, 0.12)",
  },
  light: {
    bg: "#f9fafb",
    bgSubtle: "#f3f4f6",
    surface1: "#f3f4f6",
    surface2: "#ffffff",
    surface3: "#f8fafc",
    surfaceHover: "#eef2f6",
    surfaceActive: "#e2e8f0",
    surfaceGlass: "rgba(255, 255, 255, 0.85)",
    border: "rgba(0, 0, 0, 0.08)",
    borderSubtle: "rgba(0, 0, 0, 0.04)",
    borderStrong: "rgba(0, 0, 0, 0.16)",
    borderFocus: "rgba(2, 132, 199, 0.65)",
    borderHover: "rgba(0, 0, 0, 0.12)",
    text1: "#0f172a",
    text2: "#475569",
    text3: "#94a3b8",
    textDim: "#cbd5e1",
    textOnAccent: "#ffffff",
    accent: "#0284c7",
    accentHover: "#0369a1",
    accentActive: "#075985",
    accentSubtle: "rgba(2, 132, 199, 0.10)",
    accentGlow: "0 0 20px rgba(2, 132, 199, 0.18)",
    danger: "#ef4444",
    dangerHover: "#dc2626",
    dangerSubtle: "rgba(239, 68, 68, 0.10)",
    success: "#10b981",
    successHover: "#059669",
    successSubtle: "rgba(16, 185, 129, 0.10)",
    warning: "#f59e0b",
    warningHover: "#d97706",
    warningSubtle: "rgba(245, 158, 11, 0.10)",
  },
} as const;

export const radii = {
  xs: "4px",
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "18px",
  full: "9999px",
} as const;

export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
} as const;

export const typography = {
  fontSans: '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: {
    "2xs": "0.6875rem", // 11px
    xs: "0.75rem",       // 12px
    sm: "0.8125rem",     // 13px
    base: "0.875rem",    // 14px
    md: "0.9375rem",     // 15px
    lg: "1.0625rem",     // 17px
    xl: "1.25rem",       // 20px
    "2xl": "1.5rem",     // 24px
  },
  lineHeight: {
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.625,
  },
} as const;

export const shadows = {
  sm: "var(--p-shadow-sm)",
  md: "var(--p-shadow-md)",
  lg: "var(--p-shadow-lg)",
  inner: "var(--p-shadow-inner)",
} as const;

export const motionTokens = {
  durationFastMs: 120,
  durationBaseMs: 180,
  durationSlowMs: 260,
  easeCurve: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

/**
 * CSS Variable references for direct style injection
 */
export const cssVars = {
  bg: "var(--p-bg)",
  bgSubtle: "var(--p-bg-subtle)",
  surface1: "var(--p-surface-1)",
  surface2: "var(--p-surface-2)",
  surface3: "var(--p-surface-3)",
  surfaceHover: "var(--p-surface-hover)",
  surfaceActive: "var(--p-surface-active)",
  surfaceGlass: "var(--p-surface-glass)",
  border: "var(--p-border)",
  borderSubtle: "var(--p-border-subtle)",
  borderStrong: "var(--p-border-strong)",
  borderFocus: "var(--p-border-focus)",
  borderHover: "var(--p-border-hover)",
  text1: "var(--p-text-1)",
  text2: "var(--p-text-2)",
  text3: "var(--p-text-3)",
  textDim: "var(--p-text-dim)",
  textOnAccent: "var(--p-text-on-accent)",
  accent: "var(--p-accent)",
  accentHover: "var(--p-accent-hover)",
  accentActive: "var(--p-accent-active)",
  accentSubtle: "var(--p-accent-subtle)",
  accentGlow: "var(--p-accent-glow)",
  danger: "var(--p-danger)",
  dangerHover: "var(--p-danger-hover)",
  dangerSubtle: "var(--p-danger-subtle)",
  success: "var(--p-success)",
  successHover: "var(--p-success-hover)",
  successSubtle: "var(--p-success-subtle)",
  warning: "var(--p-warning)",
  warningHover: "var(--p-warning-hover)",
  warningSubtle: "var(--p-warning-subtle)",
  radiusXs: "var(--p-radius-xs)",
  radiusSm: "var(--p-radius-sm)",
  radiusMd: "var(--p-radius-md)",
  radiusLg: "var(--p-radius-lg)",
  radiusXl: "var(--p-radius-xl)",
  radiusFull: "var(--p-radius-full)",
} as const;

export type ColorTheme = "dark" | "light";
export type RadiusKey = keyof typeof radii;
export type SpacingKey = keyof typeof spacing;
