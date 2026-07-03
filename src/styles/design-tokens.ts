/**
 * Oppscores Design System — Tokens
 *
 * Muted, professional palette. Grayscale carries the UI; color appears only
 * as small functional indicators (status dots, caution text). Import these
 * in components instead of hardcoding values.
 */

// ─── Brand Colors ───────────────────────────────────────────
// Primary: muted blue-gray — used sparingly, for primary CTAs only.
// Everything else leans on the neutral scale.

export const colors = {
  // Primary (muted blue-gray) — primary CTAs and selected states only
  primary: {
    50: "#F8FAFC",
    100: "#F1F5F9",
    200: "#E2E8F0",
    300: "#CBD5E1",
    400: "#94A3B8",
    500: "#64748B",
    600: "#4B5563",
    700: "#374151",
    800: "#1F2937",
    900: "#111827",
    950: "#030712",
  },

  // Semantic — status, trust, quality (desaturated)
  success: { light: "#F0FDF4", DEFAULT: "#4D7C5F", dark: "#3F6650" },
  warning: { light: "#FFFBEB", DEFAULT: "#B45309", dark: "#92400E" },
  danger: { light: "#FEF2F2", DEFAULT: "#B91C1C", dark: "#991B1B" },
  info: { light: "#F8FAFC", DEFAULT: "#475569", dark: "#334155" },

  // Neutrals — backgrounds, borders, text
  neutral: {
    50: "#FAFAFA",
    100: "#F5F5F5",
    150: "#F3F4F6",
    200: "#E5E5E5",
    300: "#D4D4D4",
    400: "#A3A3A3",
    500: "#737373",
    600: "#525252",
    700: "#404040",
    800: "#262626",
    900: "#1A1A1A",
    950: "#0A0A0A",
  },
} as const;

// ─── Typography ─────────────────────────────────────────────

export const typography = {
  fontFamily: {
    sans: '"Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
  },
  fontSize: {
    xs: ["0.75rem", { lineHeight: "1rem" }],
    sm: ["0.875rem", { lineHeight: "1.25rem" }],
    base: ["1rem", { lineHeight: "1.5rem" }],
    lg: ["1.125rem", { lineHeight: "1.75rem" }],
    xl: ["1.25rem", { lineHeight: "1.75rem" }],
    "2xl": ["1.5rem", { lineHeight: "2rem" }],
    "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
    "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
    "5xl": ["3rem", { lineHeight: "1" }],
  },
} as const;

// ─── Spacing & Layout ───────────────────────────────────────

export const layout = {
  maxWidth: "1280px",
  contentPadding: {
    mobile: "1rem",
    tablet: "1.5rem",
    desktop: "2rem",
  },
  borderRadius: {
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    full: "9999px",
  },
} as const;

// ─── Opportunity Type Colors ────────────────────────────────
// Every type is quiet: near-white background, dark gray-leaning text, hairline
// border. The hue differences are gentle — identification, not decoration.

export const opportunityTypeColors: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  scholarship: {
    bg: "bg-stone-50",
    text: "text-stone-700",
    border: "border-stone-200",
  },
  research_program: {
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
  },
  fellowship: {
    bg: "bg-neutral-50",
    text: "text-neutral-700",
    border: "border-neutral-200",
  },
  grant: {
    bg: "bg-emerald-50",
    text: "text-emerald-900",
    border: "border-emerald-100",
  },
  competition: {
    bg: "bg-rose-50",
    text: "text-rose-900",
    border: "border-rose-100",
  },
  leadership_program: {
    bg: "bg-indigo-50",
    text: "text-indigo-900",
    border: "border-indigo-100",
  },
  career_development_program: {
    bg: "bg-teal-50",
    text: "text-teal-900",
    border: "border-teal-100",
  },
  pipeline_program: {
    bg: "bg-sky-50",
    text: "text-sky-900",
    border: "border-sky-100",
  },
};

// ─── Source Trust Badges ────────────────────────────────────
// Informational, not promotional: neutral for official sources, a muted
// caution tone only where the user should double-check (aggregators).

export const sourceTrustStyles: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  government: { bg: "bg-neutral-100", text: "text-neutral-600", label: "Government source" },
  university: { bg: "bg-neutral-100", text: "text-neutral-600", label: "University source" },
  official_provider: {
    bg: "bg-neutral-100",
    text: "text-neutral-600",
    label: "Official provider",
  },
  foundation_or_nonprofit: {
    bg: "bg-neutral-100",
    text: "text-neutral-600",
    label: "Foundation/nonprofit",
  },
  application_portal: {
    bg: "bg-neutral-100",
    text: "text-neutral-600",
    label: "Application portal",
  },
  trusted_database: { bg: "bg-neutral-100", text: "text-neutral-600", label: "Trusted database" },
  aggregator: { bg: "bg-amber-50", text: "text-amber-800", label: "Aggregator" },
  low_trust_blog: { bg: "bg-neutral-100", text: "text-neutral-500", label: "Blog/listicle" },
  unknown: { bg: "bg-neutral-100", text: "text-neutral-500", label: "Unknown source" },
};

// ─── Application Status ─────────────────────────────────────
// Rendered as a small colored dot + plain text, no pill background.

export const applicationStatusStyles: Record<
  string,
  { text: string; dot: string }
> = {
  open: { text: "text-neutral-600", dot: "bg-green-500" },
  rolling: { text: "text-neutral-600", dot: "bg-sky-400" },
  closed: { text: "text-neutral-500", dot: "bg-red-400" },
  unknown: { text: "text-neutral-500", dot: "bg-neutral-300" },
};

// ─── Effort & Reward Levels ─────────────────────────────────

export const effortLevelStyles: Record<string, { color: string; label: string }> = {
  low: { color: "text-neutral-500", label: "Low effort" },
  medium: { color: "text-neutral-500", label: "Medium effort" },
  high: { color: "text-neutral-600", label: "High effort" },
};

export const rewardLevelStyles: Record<string, { color: string; label: string }> = {
  low: { color: "text-neutral-500", label: "Low reward" },
  medium: { color: "text-neutral-500", label: "Medium reward" },
  high: { color: "text-neutral-600", label: "High reward" },
};

// ─── Destination Confidence ─────────────────────────────────
// Small dot + text, mirroring application status.

export const destinationConfidenceStyles: Record<
  string,
  { text: string; dot: string; label: string }
> = {
  high: { text: "text-neutral-600", dot: "bg-green-500", label: "Verified destination" },
  medium: { text: "text-neutral-600", dot: "bg-amber-400", label: "Likely destination" },
  low: { text: "text-neutral-500", dot: "bg-neutral-400", label: "Unverified" },
  none: { text: "text-neutral-500", dot: "bg-neutral-300", label: "No destination found" },
};
