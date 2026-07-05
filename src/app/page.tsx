import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { GapReportDemo } from "@/components/home/gap-report-demo";
import { MatchCardsDemo } from "@/components/home/match-cards-demo";
import { Reveal } from "@/components/home/reveal";
import { VerificationChecklist } from "@/components/home/verification-checklist";

export const metadata: Metadata = {
  title: "OppScore — Opportunities you're actually competitive for",
  description:
    "OppScore finds scholarships, fellowships, research programs, grants, and competitions from official sources, verifies every application link by reading the page, and scores each one against your profile.",
};

// Refresh the live catalog count hourly.
export const revalidate = 3600;

const TYPES = [
  { name: "Scholarships", description: "Merit, need, identity, and field-specific awards, and more" },
  { name: "Fellowships", description: "Funded programs with training, mentorship, and more" },
  { name: "Research programs", description: "Summer research, lab placements, and more" },
  { name: "Grants", description: "Project, travel, and student funding, and more" },
  { name: "Competitions", description: "Hackathons, case competitions, contests, and more" },
  { name: "Leadership programs", description: "Civic engagement, youth councils, and more" },
  { name: "Career development", description: "Selective professional cohorts, and more" },
  { name: "Pipeline programs", description: "Pathways into grad school and professions, and more" },
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

async function getVerifiedCount(): Promise<number | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { count } = await supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_approved", true)
      .eq("official_source_verified", true);
    return count ?? null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const verifiedCount = await getVerifiedCount();

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
            className="hidden text-sm text-neutral-600 transition-colors hover:text-neutral-900 sm:block dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="text-sm text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
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
            {verifiedCount
              ? `${verifiedCount} live opportunities, every Apply link verified by reading the page`
              : "Every Apply link verified by reading the actual page"}
          </p>
          <h1 className="animate-fade-up stagger-1 mt-4 text-4xl font-semibold leading-[1.08] tracking-tight text-neutral-900 sm:text-[56px] dark:text-white">
            Opportunities you&apos;re actually competitive for
          </h1>
          <p className="animate-fade-up stagger-2 mx-auto mt-6 max-w-xl text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
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
              className="w-full px-6 py-3 text-center text-[15px] font-medium text-neutral-700 transition-colors hover:text-neutral-900 sm:w-auto dark:text-neutral-300 dark:hover:text-white"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Product preview — cards slide in, scores count up */}
        <div className="animate-fade-up-slow stagger-4 relative mx-auto mt-16 max-w-4xl px-6 pb-20">
          <MatchCardsDemo />
        </div>
      </section>

      {/* Steps */}
      <section className="border-y border-neutral-100 bg-neutral-50/60 dark:border-neutral-900 dark:bg-neutral-900/40">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 120}>
              <p className="text-sm font-semibold text-primary">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h2 className="mt-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-700 dark:text-neutral-400">
                {step.body}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* The apply-link promise */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid items-start gap-10 md:grid-cols-[1fr_340px]">
          <Reveal className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
              The Apply button is the product
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-neutral-700 dark:text-neutral-400">
              Most opportunity sites send you to aggregators, expired pages, or
              login walls. Before anything appears on OppScore, an AI verifier
              reads the destination page and confirms it&apos;s the real
              application for that specific opportunity. Links are re-read on a
              rotating schedule for as long as they&apos;re live.
            </p>
            <p className="mt-4 text-[15px] leading-7 text-neutral-700 dark:text-neutral-400">
              A smaller catalog of correct opportunities beats a larger catalog
              of broken links. That&apos;s the trade we made, on purpose.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <VerificationChecklist />
          </Reveal>
        </div>
      </section>

      {/* Gap reports — the coaching layer */}
      <section className="border-y border-neutral-100 bg-neutral-50/60 dark:border-neutral-900 dark:bg-neutral-900/40">
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-20 md:grid-cols-[340px_1fr] lg:grid-cols-[420px_1fr]">
          <Reveal>
            <GapReportDemo />
          </Reveal>
          <Reveal delay={150}>
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
              Know exactly why, and what to do about it
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-neutral-700 dark:text-neutral-400">
              A match score tells you where you stand. A gap report tells you
              why: which parts of your profile carry your application, which
              gaps a selection committee will notice, and the specific move
              that raises your odds before you apply.
            </p>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-neutral-700 dark:text-neutral-400">
              Reports are written per opportunity, against its real selection
              criteria, not generic advice.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Types */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <Reveal>
          <h2 className="text-sm font-medium uppercase tracking-wider text-neutral-500">
            Eight opportunity types, one place
          </h2>
        </Reveal>
        <div className="mt-6 grid grid-cols-1 gap-x-12 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {TYPES.map((type, index) => (
            <Reveal key={type.name} delay={(index % 4) * 90}>
              <div className="border-t border-neutral-200 pt-4 transition-colors hover:border-primary/40 dark:border-neutral-800">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {type.name}
                </h3>
                <p className="mt-1 text-sm leading-5 text-neutral-600 dark:text-neutral-400">
                  {type.description}
                </p>
              </div>
            </Reveal>
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
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl dark:text-white">
              Your next opportunity is already out there
            </h2>
            <p className="mt-3 text-[15px] text-neutral-700 dark:text-neutral-400">
              Set up your profile in a few minutes and see what you match.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-block rounded-lg bg-primary px-8 py-3 text-[15px] font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20"
            >
              Get started free
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-neutral-100 dark:border-neutral-900">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-neutral-500 sm:flex-row">
          <span>OppScore</span>
          <div className="flex gap-6">
            <Link href="/pricing" className="transition-colors hover:text-neutral-700 dark:hover:text-neutral-300">
              Pricing
            </Link>
            <Link href="/login" className="transition-colors hover:text-neutral-700 dark:hover:text-neutral-300">
              Sign in
            </Link>
            <Link href="/signup" className="transition-colors hover:text-neutral-700 dark:hover:text-neutral-300">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
