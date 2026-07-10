import Link from "next/link";
import type { Metadata } from "next";
import { PLAN_LIMITS, TRIAL_DAYS } from "@/lib/billing/plans";
import { StartTrialButton } from "@/components/billing/start-trial-button";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "OppScore plans: 7-day free trial on every tier, then profile-based matching, competitiveness reports, saving, deadline reminders, and AI search.",
};

const TIERS = [
  {
    plan: PLAN_LIMITS.basic,
    key: "basic" as const,
    tagline: "The verified database, matched to you.",
    features: [
      "Every verified opportunity, filtered to your eligibility",
      "Full opportunity details",
      "Save opportunities + deadline reminders",
      "New opportunities added daily",
    ],
    highlighted: false,
  },
  {
    plan: PLAN_LIMITS.pro,
    key: "pro" as const,
    tagline: "For an active application season.",
    features: [
      "Everything in Basic",
      "AI match scores in 2 categories (200 / month)",
      "30 competitiveness reports / month",
      "AI search: describe what you want in plain language",
      "Pay-as-you-go top-ups when you need more",
    ],
    highlighted: true,
  },
  {
    plan: PLAN_LIMITS.premium,
    key: "premium" as const,
    tagline: "For a search across everything.",
    features: [
      "Everything in Basic",
      "AI match scores in 4 categories (400 / month)",
      "60 competitiveness reports / month",
      "AI search with double the monthly budget",
      "Priority score refreshes",
      "Pay-as-you-go top-ups when you need more",
    ],
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100"
        >
          OppScore
        </Link>
        <nav className="flex items-center gap-6">
          <Link
            href="/login"
            className="text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <div className="max-w-xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Every plan starts with {TRIAL_DAYS} days free
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-neutral-600 dark:text-neutral-400">
            Pick a tier and try everything in it free for {TRIAL_DAYS} days -
            matching, competitiveness reports, saved deadlines, the works. No
            charge until you decide it earns its keep. Your data is always
            preserved, even if you step away.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {TIERS.map(({ plan, key, tagline, features, highlighted }) => (
            <div
              key={plan.name}
              className={`flex flex-col rounded-xl border p-6 ${
                highlighted
                  ? "border-neutral-900 dark:border-neutral-100"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-semibold">{plan.name}</h2>
                {highlighted && (
                  <span className="text-xs font-medium text-neutral-500">
                    Most popular
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-neutral-500">{tagline}</p>
              <p className="mt-5">
                <span className="text-3xl font-semibold">${plan.price}</span>
                <span className="text-sm text-neutral-500"> / month</span>
              </p>
              <p className="mt-1 text-xs font-medium text-primary">
                {TRIAL_DAYS}-day free trial
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {features.map((feature) => (
                  <li
                    key={feature}
                    className="flex gap-2.5 text-sm leading-5 text-neutral-700 dark:text-neutral-300"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600"
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <StartTrialButton
                plan={key}
                label={`Try ${plan.name} free`}
                highlighted={highlighted}
              />
            </div>
          ))}
        </div>

        <div className="mt-16 grid grid-cols-1 gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-base font-semibold">
              How matching and reports work
            </h2>
            <p className="mt-3 text-sm leading-7 text-neutral-600 dark:text-neutral-400">
              Pick the opportunity categories you care about and OppScore
              automatically scores every eligible opportunity in them against
              your profile, so your browse page always leads with your
              strongest matches. Competitiveness reports go deeper on a single
              opportunity: your specific strengths, gaps, and how to position
              your application.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold">Fair billing, honestly</h2>
            <p className="mt-3 text-sm leading-7 text-neutral-600 dark:text-neutral-400">
              Profile edits never re-charge your quota. keeping your scores
              fresh is our cost. If a payment fails you keep full access for a
              week while you fix it, and if you cancel or lapse, everything you
              built here waits for you. Downgrades keep your current tier's
              perks until the end of the month you paid for.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
