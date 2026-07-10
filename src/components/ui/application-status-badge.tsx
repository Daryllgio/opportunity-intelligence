import { applicationStatusStyles } from "@/styles/design-tokens";
import { humanizeLabel } from "@/lib/utils/format";

const statusLabels: Record<string, string> = {
  open: "Open",
  rolling: "Rolling",
  closed: "Closed",
  not_yet_open: "Not yet open",
  unknown: "Unknown",
};

export function ApplicationStatusBadge({ status }: { status: string }) {
  const style = applicationStatusStyles[status] || applicationStatusStyles.unknown;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${style.dot}`}
        aria-hidden="true"
      />
      {statusLabels[status] || humanizeLabel(status)}
    </span>
  );
}
