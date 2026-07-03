import Link from "next/link";
import { OpportunityTypeBadge } from "./opportunity-type-badge";
import { MatchScore } from "./match-score";
import { FreshnessLabel } from "./freshness-label";

interface OpportunityCardProps {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  deadline: string | null;
  applicationStatus: string | null;
  fundingAmount: string | null;
  country: string | null;
  createdAt?: string | null;
  score?: number | null;
  /** True when this type isn't in the user's scored categories. */
  unscored?: boolean;
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

function deadlineDot(deadline: string | null) {
  if (!deadline) return "bg-neutral-300";
  const days = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / 86400000
  );
  if (Number.isNaN(days) || days < 0) return "bg-neutral-300";
  if (days < 7) return "bg-red-400";
  if (days <= 14) return "bg-amber-400";
  return "bg-green-500";
}

export function OpportunityCard({
  id,
  title,
  provider,
  type,
  deadline,
  applicationStatus,
  fundingAmount,
  createdAt,
  score,
  unscored,
}: OpportunityCardProps) {
  const dimmed = typeof score === "number" && score < 40;

  return (
    <Link
      href={`/opportunities/${id}`}
      className={`group card-lift flex flex-col rounded-xl border border-neutral-200 bg-white p-5 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 ${
        dimmed ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <OpportunityTypeBadge type={type} />
        {typeof score === "number" ? (
          <MatchScore score={score} />
        ) : unscored ? (
          <span className="text-xs text-neutral-400">Not scored</span>
        ) : null}
      </div>

      <h3 className="mt-3 text-[15px] font-semibold leading-snug text-neutral-900 line-clamp-2 dark:text-neutral-100">
        {title}
      </h3>

      {provider && (
        <p className="mt-1 truncate text-sm text-neutral-500 dark:text-neutral-400">
          {provider}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="inline-flex items-center gap-1.5">
          {deadline ? (
            <>
              <span
                className={`h-1.5 w-1.5 rounded-full ${deadlineDot(deadline)}`}
                aria-hidden="true"
              />
              Due {formatDeadline(deadline)}
            </>
          ) : applicationStatus === "rolling" ? (
            <>
              <span
                className="h-1.5 w-1.5 rounded-full bg-sky-400"
                aria-hidden="true"
              />
              Rolling admissions
            </>
          ) : (
            "No deadline listed"
          )}
        </span>
        <span className="flex items-center gap-3">
          {fundingAmount && (
            <span className="truncate font-medium text-neutral-600 dark:text-neutral-300">
              {fundingAmount}
            </span>
          )}
          <FreshnessLabel createdAt={createdAt || null} />
        </span>
      </div>
    </Link>
  );
}
