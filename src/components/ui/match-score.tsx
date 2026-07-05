/**
 * Match score display with visual tiers. All scored opportunities are shown —
 * low scores are de-emphasized, never hidden.
 *
 * Tier colors: strong reads as a clear green "go", good as the brand iris
 * (positive, confident), partial as amber "check the details", low as muted.
 */

export function getMatchTier(score: number) {
  if (score >= 80) {
    return {
      label: "Strong match",
      dot: "bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-400",
      score: "text-emerald-700 dark:text-emerald-400",
    };
  }
  if (score >= 60) {
    return {
      label: "Good match",
      dot: "bg-primary",
      text: "text-primary",
      score: "text-primary",
    };
  }
  if (score >= 40) {
    return {
      label: "Partial match",
      dot: "bg-amber-500",
      text: "text-amber-700 dark:text-amber-400",
      score: "text-amber-700 dark:text-amber-400",
    };
  }
  return {
    label: "Low match",
    dot: "bg-neutral-300 dark:bg-neutral-600",
    text: "text-neutral-500 dark:text-neutral-400",
    score: "text-neutral-500 dark:text-neutral-400",
  };
}

export function MatchScore({ score }: { score: number }) {
  const tier = getMatchTier(score);

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tier.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tier.dot}`} aria-hidden="true" />
      {tier.label}
      <span className={`font-semibold tabular-nums ${tier.score}`}>{score}</span>
    </span>
  );
}
