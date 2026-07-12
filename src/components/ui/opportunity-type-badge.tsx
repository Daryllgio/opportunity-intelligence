import { opportunityTypeColors } from "@/styles/design-tokens";

const typeLabels: Record<string, string> = {
  scholarship: "Scholarship",
  research_program: "Research Program",
  fellowship: "Fellowship",
  grant: "Grant",
  competition: "Competition",
  leadership_program: "Leadership Program",
  career_development_program: "Career Development",
};

export function OpportunityTypeBadge({ type }: { type: string }) {
  const style = opportunityTypeColors[type] || opportunityTypeColors.scholarship;
  const label = typeLabels[type] || type.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text} ${style.border}`}
    >
      {label}
    </span>
  );
}
