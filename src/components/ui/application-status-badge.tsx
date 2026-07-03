import { applicationStatusStyles } from "@/styles/design-tokens";

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
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
