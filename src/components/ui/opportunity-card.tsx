import Link from "next/link";
import { OpportunityTypeBadge } from "./opportunity-type-badge";
import { MatchScore } from "./match-score";
import { FreshnessLabel } from "./freshness-label";
import { formatDateOnly } from "@/lib/utils/format";

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
  effortLevel?: string | null;
  rewardLevel?: string | null;
  score?: number | null;
  /** True when this type isn't in the user's scored categories. */
  unscored?: boolean;
  /** Short flag when a stated requirement isn't met, e.g. "Requires US citizenship". */
  eligibilityFlag?: string | null;
}

function effortRewardLine(effort?: string | null, reward?: string | null) {
  const clean = (value?: string | null) => {
    const v = String(value || "").trim().toLowerCase();
    return ["low", "medium", "high"].includes(v)
      ? v.charAt(0).toUpperCase() + v.slice(1)
      : null;
  };
  const effortLabel = clean(effort);
  const rewardLabel = clean(reward);
  if (!effortLabel && !rewardLabel) return null;
  return [
    effortLabel ? `${effortLabel} effort` : null,
    rewardLabel ? `${rewardLabel} reward` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// formatDateOnly renders the calendar date as printed on the provider's
// page — never shifted a day by the viewer's timezone.
function formatDeadline(deadline: string): string {
  return formatDateOnly(deadline, {
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
  effortLevel,
  rewardLevel,
  score,
  unscored,
  eligibilityFlag,
}: OpportunityCardProps) {
  const dimmed = typeof score === "number" && score < 40;
  const effortReward = effortRewardLine(effortLevel, rewardLevel);

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
          <span className="text-xs text-neutral-500">Not scored</span>
        ) : null}
      </div>

      <h3 className="mt-3 text-[15px] font-semibold leading-snug text-neutral-900 line-clamp-2 dark:text-neutral-100">
        {title}
      </h3>

      {provider && (
        <p className="mt-1 truncate text-sm text-neutral-600 dark:text-neutral-400">
          {provider}
        </p>
      )}

      {(effortReward || eligibilityFlag) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {effortReward && (
            <span className="text-neutral-600 dark:text-neutral-400">
              {effortReward}
            </span>
          )}
          {eligibilityFlag && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {eligibilityFlag}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs text-neutral-600 dark:text-neutral-400">
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
        <span className="flex min-w-0 items-center gap-3">
          {fundingAmount && (
            <span className="truncate font-medium text-neutral-700 dark:text-neutral-300">
              {fundingAmount}
            </span>
          )}
          <FreshnessLabel createdAt={createdAt || null} />
        </span>
      </div>
    </Link>
  );
}
