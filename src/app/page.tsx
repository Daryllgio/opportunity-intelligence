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
  { name: "Career development", description: "Professional readiness and industry exposure" },
  { name: "Pipeline programs", description: "Pathways into graduate school and professions" },
];

const STEPS = [
  {
    title: "Build your profile once",
    body: "Education, field, citizenship, experience. That's the whole setup — OppScore handles the rest.",
  },
  {
    title: "We find and verify",
    body: "Official sources are scanned daily. Every opportunity is checked for a real, working application page — never an aggregator, never a dead link.",
  },
  {
    title: "You see your best matches first",
    body: "Every opportunity is scored against your profile. Open the app and your strongest options are already at the top.",
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
            className="hidden text-sm text-neutral-500 hover:text-neutral-900 sm:block dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pb-24 pt-24 text-center sm:pt-32">
        <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-neutral-900 sm:text-[56px] dark:text-white">
          Opportunities you&apos;re actually competitive for
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-neutral-500 dark:text-neutral-400">
          Scholarships, fellowships, and programs from verified official
          sources — matched to your profile and ranked by how strong your
          application would be.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="w-full rounded-lg bg-primary px-6 py-3 text-center text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
          >
            Create your free account
          </Link>
          <Link
            href="/login"
            className="w-full px-6 py-3 text-center text-[15px] font-medium text-neutral-600 hover:text-neutral-900 sm:w-auto dark:text-neutral-300 dark:hover:text-white"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* The promise */}
      <section className="border-y border-neutral-100 bg-neutral-50/60 dark:border-neutral-900 dark:bg-neutral-900/40">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title}>
              <p className="text-sm font-medium text-neutral-400">
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
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            Every Apply button goes to the real application
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-neutral-500 dark:text-neutral-400">
            Most opportunity sites send you to aggregators, expired pages, or
            login walls. OppScore verifies the actual application destination
            for every opportunity before you ever see it — and shows you the
            source and confidence level so you can check our work. If a link
            doesn&apos;t point to the real application page, it doesn&apos;t
            get published.
          </p>
        </div>
      </section>

      {/* Types */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-400">
          Eight opportunity types, one place
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-x-12 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {TYPES.map((type) => (
            <div key={type.name} className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
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
      <section className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
            Your next opportunity is already out there
          </h2>
          <p className="mt-3 text-[15px] text-neutral-500 dark:text-neutral-400">
            Set up your profile in a few minutes and see what you match.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-lg bg-primary px-8 py-3 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get started free
          </Link>
        </div>
      </section>

      <footer className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-neutral-400 sm:flex-row">
          <span>OppScore</span>
          <div className="flex gap-6">
            <Link href="/pricing" className="hover:text-neutral-600 dark:hover:text-neutral-300">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-neutral-600 dark:hover:text-neutral-300">
              Sign in
            </Link>
            <Link href="/signup" className="hover:text-neutral-600 dark:hover:text-neutral-300">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
