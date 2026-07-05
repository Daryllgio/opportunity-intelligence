"use client";

import { useEffect, useRef, useState } from "react";

const PREVIEW_CARDS = [
  {
    type: "Fellowship",
    title: "Undergraduate Research Fellowship",
    provider: "National Science Board",
    score: 87,
    tier: "Strong match",
    tierClass: "text-emerald-700 dark:text-emerald-400",
    due: "Due in 24 days",
  },
  {
    type: "Scholarship",
    title: "International Leaders Scholarship",
    provider: "Maple Futures Foundation",
    score: 81,
    tier: "Strong match",
    tierClass: "text-emerald-700 dark:text-emerald-400",
    due: "Due in 41 days",
  },
  {
    type: "Competition",
    title: "National Data Science Challenge",
    provider: "Open Analytics Council",
    score: 74,
    tier: "Good match",
    tierClass: "text-primary",
    due: "Rolling",
  },
];

/**
 * The hero product preview: three match cards slide in one after another and
 * their scores count up — the product doing its job in three seconds. Static
 * for reduced-motion users.
 */
export function MatchCardsDemo() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);
  const [displayScores, setDisplayScores] = useState<number[]>(
    PREVIEW_CARDS.map(() => 0)
  );
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setStarted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    if (reducedMotion) {
      setDisplayScores(PREVIEW_CARDS.map((card) => card.score));
      return;
    }
    const startedAt = Date.now();
    const DURATION = 1100;
    const interval = setInterval(() => {
      const t = Math.min(1, (Date.now() - startedAt) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayScores(PREVIEW_CARDS.map((card) => Math.round(card.score * eased)));
      if (t >= 1) clearInterval(interval);
    }, 40);
    return () => clearInterval(interval);
  }, [started, reducedMotion]);

  return (
    <div
      ref={ref}
      className="rounded-2xl border border-neutral-200 bg-white/80 p-3 shadow-[0_24px_80px_-32px_rgba(46,48,112,0.25)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
          Your top matches
        </p>
        <p className="text-xs text-neutral-500">Sorted by match strength</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {PREVIEW_CARDS.map((card, index) => (
          <div
            key={card.title}
            className={`rounded-xl border border-neutral-100 bg-white p-4 transition-all duration-500 dark:border-neutral-800 dark:bg-neutral-950 ${
              started || reducedMotion
                ? "translate-y-0 opacity-100"
                : "translate-y-3 opacity-0"
            }`}
            style={{ transitionDelay: `${index * 140}ms` }}
          >
            <div className="flex items-center justify-between">
              <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {card.type}
              </span>
              <span
                className={`text-xs font-semibold tabular-nums ${
                  card.score >= 80
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-primary"
                }`}
              >
                {displayScores[index]}
              </span>
            </div>
            <p className="mt-2.5 text-[13px] font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
              {card.title}
            </p>
            <p className="mt-0.5 truncate text-xs text-neutral-500">
              {card.provider}
            </p>
            <div className="mt-3 flex items-center justify-between text-[11px]">
              <span className={`font-medium ${card.tierClass}`}>{card.tier}</span>
              <span className="text-neutral-500">{card.due}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
