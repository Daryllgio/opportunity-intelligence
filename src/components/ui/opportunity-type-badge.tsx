import { opportunityTypeColors } from "@/styles/design-tokens";

const typeLabels: Record<string, string> = {
  scholarship: "Scholarship",
  research_program: "Research Program",
  fellowship: "Fellowship",
  grant: "Grant",
  competition: "Competition",
  leadership_program: "Leadership Program",
  career_development_program: "Career Development",
  pipeline_program: "Pipeline Program",
};

export function OpportunityTypeBadge({ type }: { type: string }) {
  const style = opportunityTypeColors[type] || opportunityTypeColors.scholarship;
  const label = typeLabels[type] || type.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}
    >
      <span className="text-sm" aria-hidden="true">
        {style.icon}
      </span>
      {label}
    </span>
  );
}
