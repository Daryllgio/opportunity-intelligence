"use client";

import { useEffect, useRef, useState } from "react";

const CHECKS = [
  "Official source confirmed",
  "Application page read and verified by AI",
  "Deadline current for this cycle",
  "Re-verified nightly while it's live",
];

/**
 * The publish checklist, checking itself off as it scrolls into view — the
 * core promise, animated. Static for reduced-motion users.
 */
export function VerificationChecklist() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [checkedCount, setCheckedCount] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    if (media.matches) setCheckedCount(CHECKS.length);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setCheckedCount(CHECKS.length);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        if (reducedMotion) {
          setCheckedCount(CHECKS.length);
          return;
        }
        CHECKS.forEach((_, index) => {
          setTimeout(() => setCheckedCount(index + 1), 350 + index * 420);
        });
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <div
      ref={ref}
      className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
        Before anything is published
      </p>
      <ul className="mt-3 space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
        {CHECKS.map((check, index) => {
          const checked = index < checkedCount;
          return (
            <li key={check} className="flex items-center gap-2.5">
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                  checked
                    ? "border-primary bg-primary text-white"
                    : "border-neutral-300 bg-transparent dark:border-neutral-700"
                }`}
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 12 12"
                  className={`h-2.5 w-2.5 transition-opacity duration-200 ${checked ? "opacity-100" : "opacity-0"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 6.5L4.5 9L10 3.5" />
                </svg>
              </span>
              <span
                className={`transition-colors duration-300 ${
                  checked
                    ? "text-neutral-800 dark:text-neutral-200"
                    : "text-neutral-500 dark:text-neutral-500"
                }`}
              >
                {check}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 border-t border-neutral-100 pt-3 text-xs leading-5 text-neutral-500 dark:border-neutral-800">
        If a page can&apos;t be verified, it isn&apos;t published. Ever.
      </p>
    </div>
  );
}
