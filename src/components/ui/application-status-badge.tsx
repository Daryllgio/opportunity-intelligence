import { applicationStatusStyles } from "@/styles/design-tokens";

export function ApplicationStatusBadge({ status }: { status: string }) {
  const style = applicationStatusStyles[status] || applicationStatusStyles.unknown;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${style.dot}`}
        aria-hidden="true"
      />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
