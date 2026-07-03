import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OppScore — Opportunities you're actually competitive for",
  description:
    "OppScore finds scholarships, fellowships, research programs, grants, and competitions from official sources, verifies every application link, and scores each one against your profile.",
};

const TYPES = [
  { name: "Scholarships", description: "Financial awards for education at every level" },
  { name: "Fellowships", description: "Funded programs with training and mentorship" },
  { name: "Research programs", description: "Structured placements and summer research" },
  { name: "Grants", description: "Funding for students, projects, and travel" },
  { name: "Competitions", description: "Contests, challenges, and innovation awards" },
  { name: "Leadership programs", description: "Leadership development and civic engagement" },
  { name: "Career development", description: "Selective professional development cohorts" },
  { name: "Pipeline programs", description: "Pathways into graduate school and professions" },
];

const STEPS = [
  {
    title: "Build your profile once",
    body: "Education, field, citizenship, experience. That's the whole setup. OppScore handles the rest.",
  },
  {
    title: "We find and verify",
    body: "Official sources are scanned nightly. An AI verifier reads every application page before it's published, and keeps re-checking it for as long as it's live.",
  },
  {
    title: "Your best matches come to you",
    body: "Every opportunity is scored against your profile. Open the app and your strongest options are already at the top.",
  },
];

const PREVIEW_CARDS = [
  {
    type: "Fellowship",
    title: "Undergraduate Research Fellowship",
    provider: "National Science Board",
    score: 87,
    tier: "Strong match",
    due: "Due in 24 days",
  },
  {
    type: "Scholarship",
    title: "International Leaders Scholarship",
    provider: "Maple Futures Foundation",
    score: 81,
    tier: "Strong match",
    due: "Due in 41 days",
  },
  {
    type: "Competition",
    title: "National Data Science Challenge",
    provider: "Open Analytics Council",
    score: 74,
    tier: "Good match",
    due: "Rolling",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      {/* Top bar */}
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <span className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          OppScore
        </span>
        <nav className="flex items-center gap-6">
          <Link
            href="/pricing"
            className="hidden text-sm text-neutral-500 transition-colors hover:text-neutral-900 sm:block dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-md"
          >
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(58%_60%_at_50%_0%,rgba(85,88,204,0.09),transparent_70%)] dark:bg-[radial-gradient(58%_60%_at_50%_0%,rgba(106,109,224,0.12),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-3xl px-6 pt-20 text-center sm:pt-28">
          <p className="animate-fade-up text-sm font-medium text-primary">
            Every Apply link verified by reading the actual page
          </p>
          <h1 className="animate-fade-up stagger-1 mt-4 text-4xl font-semibold leading-[1.08] tracking-tight text-neutral-900 sm:text-[56px] dark:text-white">
            Opportunities you&apos;re actually competitive for
          </h1>
          <p className="animate-fade-up stagger-2 mx-auto mt-6 max-w-xl text-lg leading-relaxed text-neutral-500 dark:text-neutral-400">
            Scholarships, fellowships, and programs from verified official
            sources, matched to your profile and ranked by how strong your
            application would be.
          </p>
          <div className="animate-fade-up stagger-3 mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="w-full rounded-lg bg-primary px-6 py-3 text-center text-[15px] font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 sm:w-auto"
            >
              Create your free account
            </Link>
            <Link
              href="/login"
              className="w-full px-6 py-3 text-center text-[15px] font-medium text-neutral-600 transition-colors hover:text-neutral-900 sm:w-auto dark:text-neutral-300 dark:hover:text-white"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Product preview */}
        <div className="animate-fade-up-slow stagger-4 relative mx-auto mt-16 max-w-4xl px-6 pb-20">
          <div className="rounded-2xl border border-neutral-200 bg-white/80 p-3 shadow-[0_24px_80px_-32px_rgba(46,48,112,0.25)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                Your top matches
              </p>
              <p className="text-xs text-neutral-400">Sorted by match strength</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {PREVIEW_CARDS.map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {card.type}
                    </span>
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        card.score >= 80 ? "text-primary" : "text-neutral-600 dark:text-neutral-300"
                      }`}
                    >
                      {card.score}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[13px] font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
                    {card.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-neutral-400">
                    {card.provider}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[11px]">
                    <span
                      className={
                        card.score >= 80
                          ? "font-medium text-primary"
                          : "font-medium text-neutral-500"
                      }
                    >
                      {card.tier}
                    </span>
                    <span className="text-neutral-400">{card.due}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="border-y border-neutral-100 bg-neutral-50/60 dark:border-neutral-900 dark:bg-neutral-900/40">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title}>
              <p className="text-sm font-semibold text-primary">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h2 className="mt-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* The apply-link promise */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid items-start gap-10 md:grid-cols-[1fr_320px]">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
              The Apply button is the product
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-neutral-500 dark:text-neutral-400">
              Most opportunity sites send you to aggregators, expired pages, or
              login walls. Before anything appears on OppScore, an AI verifier
              reads the destination page and confirms it&apos;s the real
              application for that specific opportunity. Links are re-read on a
              rotating schedule for as long as they&apos;re live. If a page
              can&apos;t be verified, it isn&apos;t published.
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
              Before publishing
            </p>
            <ul className="mt-3 space-y-2.5 text-sm text-neutral-600 dark:text-neutral-300">
              <li className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                Official source confirmed
              </li>
              <li className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                Application page read and verified
              </li>
              <li className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                Deadline current for this cycle
              </li>
              <li className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                Re-verified while it&apos;s live
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Types */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-400">
          Eight opportunity types, one place
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-x-12 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {TYPES.map((type) => (
            <div
              key={type.name}
              className="border-t border-neutral-200 pt-4 transition-colors hover:border-primary/40 dark:border-neutral-800"
            >
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {type.name}
              </h3>
              <p className="mt-1 text-sm leading-5 text-neutral-500 dark:text-neutral-400">
                {type.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden border-t border-neutral-100 dark:border-neutral-900">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[320px] bg-[radial-gradient(50%_80%_at_50%_100%,rgba(85,88,204,0.08),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl dark:text-white">
            Your next opportunity is already out there
          </h2>
          <p className="mt-3 text-[15px] text-neutral-500 dark:text-neutral-400">
            Set up your profile in a few minutes and see what you match.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-lg bg-primary px-8 py-3 text-[15px] font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20"
          >
            Get started free
          </Link>
        </div>
      </section>

      <footer className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-neutral-400 sm:flex-row">
          <span>OppScore</span>
          <div className="flex gap-6">
            <Link href="/pricing" className="transition-colors hover:text-neutral-600 dark:hover:text-neutral-300">
              Pricing
            </Link>
            <Link href="/login" className="transition-colors hover:text-neutral-600 dark:hover:text-neutral-300">
              Sign in
            </Link>
            <Link href="/signup" className="transition-colors hover:text-neutral-600 dark:hover:text-neutral-300">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
