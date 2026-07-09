"use client";

import { useEffect, useRef, useState } from "react";

const REPORT_LINES = [
  { kind: "strength", text: "Your research experience matches what this fellowship weighs most." },
  { kind: "strength", text: "3.8 GPA clears the academic bar comfortably." },
  { kind: "gap", text: "No leadership evidence yet — selection committees look for it here." },
  { kind: "gap", text: "Your essay needs a concrete community-impact example." },
  { kind: "action", text: "Lead one campus initiative this term, then reapply strength: 87." },
] as const;

const KIND_STYLES: Record<string, { label: string; className: string }> = {
  strength: { label: "Strength", className: "text-emerald-700 dark:text-emerald-400" },
  gap: { label: "Gap", className: "text-amber-700 dark:text-amber-400" },
  action: { label: "Do this", className: "text-primary" },
};

/**
 * A gap report "writing itself", looping. Types each line in sequence,
 * holds the finished report, then starts over. Users who prefer reduced
 * motion (or have JS disabled mid-hydration) see the finished report.
 */
export function GapReportDemo() {
  const [progress, setProgress] = useState<{ line: number; chars: number }>({
    line: 0,
    chars: 0,
  });
  const [reducedMotion, setReducedMotion] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    const tick = () => {
      setProgress((current) => {
        const lineText = REPORT_LINES[current.line]?.text || "";
        if (current.chars < lineText.length) {
          return { ...current, chars: current.chars + 2 };
        }
        if (current.line < REPORT_LINES.length - 1) {
          return { line: current.line + 1, chars: 0 };
        }
        return current; // finished; hold handled below
      });
    };

    const interval = setInterval(tick, 24);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  const finished =
    progress.line === REPORT_LINES.length - 1 &&
    progress.chars >= REPORT_LINES[REPORT_LINES.length - 1].text.length;

  useEffect(() => {
    if (!finished || reducedMotion) return;
    timerRef.current = setTimeout(() => {
      setProgress({ line: 0, chars: 0 });
    }, 4200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [finished, reducedMotion]);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_16px_48px_-24px_rgba(46,48,112,0.3)] sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            Competitiveness report
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            National STEM Leaders Fellowship
          </p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-primary/30 text-sm font-bold tabular-nums text-primary">
          72
        </div>
      </div>

      <ul className="mt-4 min-h-[196px] space-y-2.5 sm:min-h-[172px]">
        {REPORT_LINES.map((line, index) => {
          const style = KIND_STYLES[line.kind];
          const visible = reducedMotion || index <= progress.line;
          const text = reducedMotion
            ? line.text
            : index < progress.line
              ? line.text
              : index === progress.line
                ? line.text.slice(0, progress.chars)
                : "";
          const typing = !reducedMotion && index === progress.line && !finished;
          if (!visible) return <li key={index} className="min-h-5" />;
          return (
            <li key={index} className="flex gap-2 text-sm leading-5">
              <span className={`w-14 shrink-0 text-xs font-semibold ${style.className}`}>
                {style.label}
              </span>
              <span className="text-neutral-700 dark:text-neutral-300">
                {text}
                {typing && (
                  <span
                    className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-primary align-middle"
                    aria-hidden="true"
                  />
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500 dark:border-neutral-800">
        Written by AI from your profile and the selection criteria of this
        specific opportunity.
      </p>
    </div>
  );
}
