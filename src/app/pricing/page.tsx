import Link from "next/link";
import type { Metadata } from "next";
import { PLAN_LIMITS } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "OppScore plans: browse free, or unlock profile-based matching, competitiveness reports, saving, and deadline reminders.",
};

const TIERS = [
  {
    plan: PLAN_LIMITS.free,
    tagline: "See what's out there.",
    features: [
      "Browse all opportunity types",
      "Basic opportunity info",
      "Verified application links",
    ],
    cta: "Start free",
    highlighted: false,
  },
  {
    plan: PLAN_LIMITS.basic,
    tagline: "For a focused search.",
    features: [
      "Full opportunity details",
      "Matching in 1 category",
      "20 competitiveness reports / month",
      "Save opportunities + deadline reminders",
    ],
    cta: "Get Basic",
    highlighted: false,
  },
  {
    plan: PLAN_LIMITS.pro,
    tagline: "For an active application season.",
    features: [
      "Full opportunity details",
      "Matching in 2 categories",
      "40 competitiveness reports / month",
      "Save opportunities + deadline reminders",
    ],
    cta: "Get Pro",
    highlighted: true,
  },
  {
    plan: PLAN_LIMITS.premium,
    tagline: "For a search across everything.",
    features: [
      "Full opportunity details",
      "Matching in 4 categories",
      "80 competitiveness reports / month",
      "AI search: describe what you want in plain language",
      "Save opportunities + deadline reminders",
      "Priority score refreshes",
    ],
    cta: "Get Premium",
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
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
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
            Simple plans, honest limits
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-neutral-600 dark:text-neutral-400">
            Every plan browses the same verified opportunities. Paid plans add
            profile-based matching, competitiveness reports, saving, deadline
            reminders, and on Premium, AI search in plain language.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {TIERS.map(({ plan, tagline, features, cta, highlighted }) => (
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
                  <span className="text-xs font-medium text-neutral-400">
                    Most popular
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-neutral-400">{tagline}</p>
              <p className="mt-5">
                <span className="text-3xl font-semibold">${plan.price}</span>
                {plan.price > 0 && (
                  <span className="text-sm text-neutral-400"> / month</span>
                )}
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {features.map((feature) => (
                  <li
                    key={feature}
                    className="flex gap-2.5 text-sm leading-5 text-neutral-600 dark:text-neutral-300"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600"
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`mt-8 rounded-lg px-4 py-2 text-center text-sm font-medium transition-colors ${
                  highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                }`}
              >
                {cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-16 max-w-2xl">
          <h2 className="text-base font-semibold">
            How matching and reports work
          </h2>
          <p className="mt-3 text-sm leading-7 text-neutral-500 dark:text-neutral-400">
            Pick the opportunity categories you care about and OppScore
            automatically scores every eligible opportunity in them against
            your profile — your browse page is always sorted with your
            strongest matches first. Competitiveness reports go deeper on a
            single opportunity: your specific strengths, gaps, and how to
            position your application. You can run a report on any
            opportunity, including ones outside your matched categories.
          </p>
        </div>
      </section>
    </main>
  );
}
