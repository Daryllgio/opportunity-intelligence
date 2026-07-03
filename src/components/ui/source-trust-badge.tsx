import { sourceTrustStyles } from "@/styles/design-tokens";

export function SourceTrustBadge({ category }: { category: string }) {
  const style = sourceTrustStyles[category] || sourceTrustStyles.unknown;

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
