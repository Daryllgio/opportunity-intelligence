import { destinationConfidenceStyles } from "@/styles/design-tokens";

/**
 * Destination trust badge. AI page verification is the ground truth: when the
 * verifier has read the page and confirmed it, say so — the heuristic
 * confidence tiers only describe rows the verifier hasn't confirmed.
 */
export function DestinationConfidenceBadge({
  confidence,
  verified = false,
}: {
  confidence: string;
  verified?: boolean;
}) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        Verified by AI page check
      </span>
    );
  }

  const style =
    destinationConfidenceStyles[confidence] || destinationConfidenceStyles.none;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${style.dot}`}
        aria-hidden="true"
      />
      {style.label}
    </span>
  );
}
