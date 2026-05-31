import { sourceTrustStyles } from "@/styles/design-tokens";

export function SourceTrustBadge({ category }: { category: string }) {
  const style = sourceTrustStyles[category] || sourceTrustStyles.unknown;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
