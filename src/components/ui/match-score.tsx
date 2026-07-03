/**
 * Match score display with visual tiers. All scored opportunities are shown —
 * low scores are de-emphasized, never hidden.
 */

export function getMatchTier(score: number) {
  if (score >= 80) {
    return {
      label: "Strong match",
      dot: "bg-primary",
      text: "text-primary",
      score: "text-primary",
    };
  }
  if (score >= 60) {
    return {
      label: "Good match",
      dot: "bg-green-500",
      text: "text-neutral-700 dark:text-neutral-200",
      score: "text-neutral-800 dark:text-neutral-100",
    };
  }
  if (score >= 40) {
    return {
      label: "Partial match",
      dot: "bg-neutral-300",
      text: "text-neutral-500 dark:text-neutral-400",
      score: "text-neutral-600 dark:text-neutral-300",
    };
  }
  return {
    label: "Low match",
    dot: "bg-neutral-200",
    text: "text-neutral-400 dark:text-neutral-500",
    score: "text-neutral-400 dark:text-neutral-500",
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
