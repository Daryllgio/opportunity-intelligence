/**
 * Oppscores Design System — Tokens
 *
 * These tokens define the visual identity of the platform.
 * Import and use these in components instead of hardcoding values.
 * Tailwind classes that reference these are defined in globals.css.
 */

// ─── Brand Colors ───────────────────────────────────────────
// Primary: Deep indigo — trust, intelligence, ambition
// Secondary: Warm amber — opportunity, energy, action
// Accent: Teal — growth, discovery, success

export const colors = {
  // Primary (indigo) — main brand, nav, CTAs, selected states
  primary: {
    50: "#EEF2FF",
    100: "#E0E7FF",
    200: "#C7D2FE",
    300: "#A5B4FC",
    400: "#818CF8",
    500: "#6366F1",
    600: "#4F46E5",
    700: "#4338CA",
    800: "#3730A3",
    900: "#312E81",
    950: "#1E1B4B",
  },

  // Secondary (amber) — deadlines, urgency, highlights, warm accents
  secondary: {
    50: "#FFFBEB",
    100: "#FEF3C7",
    200: "#FDE68A",
    300: "#FCD34D",
    400: "#FBBF24",
    500: "#F59E0B",
    600: "#D97706",
    700: "#B45309",
    800: "#92400E",
    900: "#78350F",
    950: "#451A03",
  },

  // Accent (teal) — success, verified, open status, growth
  accent: {
    50: "#F0FDFA",
    100: "#CCFBF1",
    200: "#99F6E4",
    300: "#5EEAD4",
    400: "#2DD4BF",
    500: "#14B8A6",
    600: "#0D9488",
    700: "#0F766E",
    800: "#115E59",
    900: "#134E4A",
    950: "#042F2E",
  },

  // Semantic — status, trust, quality
  success: { light: "#DCFCE7", DEFAULT: "#22C55E", dark: "#15803D" },
  warning: { light: "#FEF9C3", DEFAULT: "#EAB308", dark: "#A16207" },
  danger: { light: "#FEE2E2", DEFAULT: "#EF4444", dark: "#B91C1C" },
  info: { light: "#DBEAFE", DEFAULT: "#3B82F6", dark: "#1D4ED8" },

  // Neutrals — backgrounds, borders, text
  neutral: {
    50: "#FAFAF9",
    100: "#F5F5F4",
    150: "#EFEFED",
    200: "#E7E5E4",
    300: "#D6D3D1",
    400: "#A8A29E",
    500: "#78716C",
    600: "#57534E",
    700: "#44403C",
    800: "#292524",
    900: "#1C1917",
    950: "#0C0A09",
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
// Each opportunity type gets a consistent color across the platform

export const opportunityTypeColors: Record<
  string,
  { bg: string; text: string; border: string; icon: string }
> = {
  scholarship: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    icon: "🎓",
  },
  research_program: {
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-200",
    icon: "🔬",
  },
  fellowship: {
    bg: "bg-violet-50",
    text: "text-violet-800",
    border: "border-violet-200",
    icon: "🌟",
  },
  grant: {
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
    icon: "💰",
  },
  competition: {
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200",
    icon: "🏆",
  },
  leadership_program: {
    bg: "bg-indigo-50",
    text: "text-indigo-800",
    border: "border-indigo-200",
    icon: "👥",
  },
  career_development_program: {
    bg: "bg-teal-50",
    text: "text-teal-800",
    border: "border-teal-200",
    icon: "📈",
  },
  pipeline_program: {
    bg: "bg-cyan-50",
    text: "text-cyan-800",
    border: "border-cyan-200",
    icon: "🚀",
  },
};

// ─── Source Trust Badges ────────────────────────────────────

export const sourceTrustStyles: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  government: { bg: "bg-blue-50", text: "text-blue-700", label: "Government source" },
  university: { bg: "bg-indigo-50", text: "text-indigo-700", label: "University source" },
  official_provider: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    label: "Official provider",
  },
  foundation_or_nonprofit: {
    bg: "bg-teal-50",
    text: "text-teal-700",
    label: "Foundation/nonprofit",
  },
  application_portal: {
    bg: "bg-purple-50",
    text: "text-purple-700",
    label: "Application portal",
  },
  trusted_database: { bg: "bg-sky-50", text: "text-sky-700", label: "Trusted database" },
  aggregator: { bg: "bg-orange-50", text: "text-orange-700", label: "Aggregator" },
  low_trust_blog: { bg: "bg-stone-100", text: "text-stone-600", label: "Blog/listicle" },
  unknown: { bg: "bg-gray-100", text: "text-gray-600", label: "Unknown source" },
};

// ─── Application Status ─────────────────────────────────────

export const applicationStatusStyles: Record<
  string,
  { bg: string; text: string; dot: string }
> = {
  open: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  rolling: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  closed: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  unknown: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
};

// ─── Effort & Reward Levels ─────────────────────────────────

export const effortLevelStyles: Record<string, { color: string; label: string }> = {
  low: { color: "text-green-600", label: "Low effort" },
  medium: { color: "text-amber-600", label: "Medium effort" },
  high: { color: "text-red-600", label: "High effort" },
};

export const rewardLevelStyles: Record<string, { color: string; label: string }> = {
  low: { color: "text-gray-500", label: "Low reward" },
  medium: { color: "text-blue-600", label: "Medium reward" },
  high: { color: "text-emerald-600", label: "High reward" },
};

// ─── Destination Confidence ─────────────────────────────────

export const destinationConfidenceStyles: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  high: { bg: "bg-green-50", text: "text-green-700", label: "Verified destination" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", label: "Likely destination" },
  low: { bg: "bg-orange-50", text: "text-orange-700", label: "Unverified" },
  none: { bg: "bg-gray-100", text: "text-gray-500", label: "No destination found" },
};
