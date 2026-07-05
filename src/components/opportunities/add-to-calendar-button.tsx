"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * "Add to Calendar" with explicit destinations: Google Calendar (web),
 * Outlook (web), or a downloadable .ics reminder that opens in Apple
 * Calendar and desktop apps. Whatever calendar someone lives in, the
 * deadline lands there without guesswork.
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
  const detailUrl = `${appUrl}/opportunities/${opportunityId}`;
  const eventTitle = `Deadline: ${title}`;
  const eventDetails = `Application deadline for ${title}.\n\nView on OppScore: ${detailUrl}`;
  const dateStamp = deadline.replace(/-/g, "").slice(0, 8);

  const googleUrl = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle,
    dates: `${dateStamp}/${dateStamp}`,
    details: eventDetails,
  }).toString()}`;

  const outlookUrl = `https://outlook.live.com/calendar/0/action/compose?${new URLSearchParams({
    rru: "addevent",
    subject: eventTitle,
    body: eventDetails,
    startdt: deadline.slice(0, 10),
    enddt: deadline.slice(0, 10),
    allday: "true",
  }).toString()}`;

  function downloadIcs() {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
    const escapeText = (value: string) =>
      value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//OppScore//Deadline Reminder//EN",
      "BEGIN:VEVENT",
      `UID:oppscore-${opportunityId}@oppscore`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateStamp}`,
      `SUMMARY:${escapeText(eventTitle)}`,
      `DESCRIPTION:${escapeText(eventDetails)}`,
      `URL:${detailUrl}`,
      "BEGIN:VALARM",
      "TRIGGER:-P3D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`3 days until the ${title} deadline`)}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `oppscore-deadline-${dateStamp}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
        >
          Add deadline to calendar
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem asChild>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer">
            <span className="flex flex-col">
              <span>Google Calendar</span>
              <span className="text-xs text-neutral-500">Opens in your browser</span>
            </span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={outlookUrl} target="_blank" rel="noopener noreferrer">
            <span className="flex flex-col">
              <span>Outlook</span>
              <span className="text-xs text-neutral-500">Opens Outlook on the web</span>
            </span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={downloadIcs}>
          <span className="flex flex-col">
            <span>Download reminder (.ics)</span>
            <span className="text-xs text-neutral-500">
              For Apple Calendar and desktop apps
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
