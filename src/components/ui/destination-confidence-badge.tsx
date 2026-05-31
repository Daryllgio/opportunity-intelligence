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
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
