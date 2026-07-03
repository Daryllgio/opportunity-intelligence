"use client";

/**
 * One-click "Add to Calendar" — builds a Google Calendar template URL for the
 * opportunity deadline. No API involved; students live in their calendars.
 */
export function AddToCalendarButton({
  title,
  deadline,
  opportunityId,
}: {
  title: string;
  deadline: string | null;
  opportunityId: string;
}) {
  if (!deadline) return null;

  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://oppscore.app";
  const dateStamp = deadline.replace(/-/g, "").slice(0, 8);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Deadline: ${title}`,
    dates: `${dateStamp}/${dateStamp}`,
    details: `Application deadline for ${title}.\n\nView on OppScore: ${appUrl}/opportunities/${opportunityId}`,
  });

  return (
    <a
      href={`https://calendar.google.com/calendar/render?${params.toString()}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
    >
      Add deadline to calendar
    </a>
  );
}
