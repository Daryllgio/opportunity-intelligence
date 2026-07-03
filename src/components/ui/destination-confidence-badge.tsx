import { destinationConfidenceStyles } from "@/styles/design-tokens";

export function DestinationConfidenceBadge({
  confidence,
}: {
  confidence: string;
}) {
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
