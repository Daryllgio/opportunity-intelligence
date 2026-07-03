import { OpportunityTypeBadge } from "./opportunity-type-badge";
import { ApplicationStatusBadge } from "./application-status-badge";
import { SourceTrustBadge } from "./source-trust-badge";

interface OpportunityCardProps {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  deadline: string | null;
  applicationStatus: string | null;
  fundingAmount: string | null;
  country: string | null;
  effortLevel: string | null;
  rewardLevel: string | null;
  sourceCategory: string | null;
  eligibleEducationLevels: string[] | null;
  score?: number | null;
}

function formatDeadline(deadline: string): string {
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return deadline;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function OpportunityCard({
  id,
  title,
  provider,
  type,
  deadline,
  applicationStatus,
  fundingAmount,
  country,
  effortLevel,
  sourceCategory,
  score,
}: OpportunityCardProps) {
  return (
    <a
      href={`/opportunities/${id}`}
      className="group block rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5 transition-shadow hover:shadow-sm"
    >
      {/* Top row: type badge + status */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <OpportunityTypeBadge type={type} />
        {applicationStatus && (
          <ApplicationStatusBadge status={applicationStatus} />
        )}
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2 mb-1">
        {title}
      </h3>

      {/* Provider */}
      {provider && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">
          {provider}
        </p>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        {deadline && (
          <span className="flex items-center gap-1">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            {formatDeadline(deadline)}
          </span>
        )}
        {fundingAmount && (
          <span className="flex items-center gap-1">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {fundingAmount}
          </span>
        )}
        {country && (
          <span className="flex items-center gap-1">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {country}
          </span>
        )}
      </div>

      {/* Bottom row: source trust + effort + score */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-700">
        <div className="flex items-center gap-2">
          {sourceCategory && <SourceTrustBadge category={sourceCategory} />}
          {effortLevel && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {effortLevel.charAt(0).toUpperCase() + effortLevel.slice(1)} effort
            </span>
          )}
        </div>
        {score != null && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-400">Match</span>
            <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              {score}
            </span>
          </div>
        )}
      </div>
    </a>
  );
}
