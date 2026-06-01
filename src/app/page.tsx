import Link from "next/link";
import { SourceTrustBadge } from "@/components/ui/source-trust-badge";
import { opportunityTypeColors } from "@/styles/design-tokens";

const TYPE_CARDS: { type: string; name: string; description: string }[] = [
  { type: "scholarship", name: "Scholarships", description: "Financial awards for education" },
  { type: "research_program", name: "Research Programs", description: "Structured research placements and summer programs" },
  { type: "fellowship", name: "Fellowships", description: "Selective programs with funding, training, and mentorship" },
  { type: "grant", name: "Grants", description: "Funding for students, researchers, and projects" },
  { type: "competition", name: "Competitions", description: "Contests, challenges, and innovation awards" },
  { type: "leadership_program", name: "Leadership Programs", description: "Leadership training and civic engagement" },
  { type: "career_development_program", name: "Career Development", description: "Professional readiness and industry exposure" },
  { type: "pipeline_program", name: "Pipeline Programs", description: "Pathways to graduate school and professions" },
];

const DIFFERENTIATORS = [
  { label: "Source verification", detail: "Official vs aggregator clearly labeled" },
  { label: "Application link quality", detail: "Verified destinations, not login walls" },
  { label: "Eligibility matching", detail: "Filtered to your education, field, country" },
  { label: "Deadline tracking", detail: "Status: open, rolling, closed, upcoming" },
  { label: "Effort vs reward", detail: "Know what's worth your time" },
  { label: "All opportunity types", detail: "8 categories beyond just scholarships" },
];

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col bg-white dark:bg-neutral-950">
      {/* Top bar */}
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <span className="text-xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
            OppScore
          </span>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Section 1: Hero */}
      <section className="bg-gradient-to-b from-indigo-50 to-white dark:from-neutral-900 dark:to-neutral-950">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:py-32">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Opportunity Intelligence Platform
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl dark:text-white">
            Find opportunities that actually fit you
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-500 sm:text-xl dark:text-neutral-400">
            Discover scholarships, research programs, fellowships, grants,
            competitions, and more — verified, scored, and matched to your
            profile.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/opportunities"
              className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-indigo-700 sm:w-auto"
            >
              Browse opportunities
            </Link>
            <Link
              href="/signup"
              className="w-full rounded-lg border border-neutral-300 px-6 py-3 text-center font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 sm:w-auto dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
            >
              Create free account
            </Link>
          </div>
          <p className="mt-6 text-sm text-neutral-400">
            Trusted sources • Official verification • Personalized matching
          </p>
        </div>
      </section>

      {/* Section 2: Opportunity types */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-bold text-neutral-900 sm:text-3xl dark:text-white">
            Every opportunity type, one platform
          </h2>
          <p className="mt-3 text-base text-neutral-500 dark:text-neutral-400">
            More than scholarships. We track 8 categories of opportunities across
            education, research, funding, and career development.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {TYPE_CARDS.map((card) => {
            const style =
              opportunityTypeColors[card.type] || opportunityTypeColors.scholarship;
            return (
              <Link
                key={card.type}
                href={`/opportunities?type=${card.type}`}
                className={`group rounded-xl border-t-4 ${style.border} bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-neutral-900`}
              >
                <span className="text-2xl" aria-hidden="true">
                  {style.icon}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {card.name}
                </h3>
                <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                  {card.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Section 3: How it works */}
      <section className="bg-neutral-50 dark:bg-neutral-900/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-center text-2xl font-bold text-neutral-900 sm:text-3xl dark:text-white">
            How Oppscores works
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Discover",
                body: "We scan thousands of official sources — universities, government agencies, foundations, and program providers — to find opportunities you'd never find on your own.",
              },
              {
                step: "2",
                title: "Verify",
                body: "Every opportunity is classified by source quality, checked for valid application links, and validated before you see it. No dead links. No misleading aggregator pages.",
              },
              {
                step: "3",
                title: "Match",
                body: "Set your profile — education level, field, location, goals — and we score every opportunity on how well it fits you. Focus your time on the ones worth applying to.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center md:text-left">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-indigo-600 text-lg font-bold text-white md:mx-0">
                  {item.step}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: Why not just Google */}
      <section className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-center text-2xl font-bold text-neutral-900 sm:text-3xl dark:text-white">
          Built for opportunity decisions, not just search
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Google / Aggregators
            </h3>
            <ul className="mt-4 space-y-3">
              {DIFFERENTIATORS.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2 text-sm text-neutral-400"
                >
                  <span className="text-neutral-300" aria-hidden="true">
                    ✕
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-6 dark:border-teal-900 dark:bg-teal-950/30">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400">
              Oppscores
            </h3>
            <ul className="mt-4 space-y-3">
              {DIFFERENTIATORS.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-sm">
                  <span
                    className="mt-0.5 text-teal-600 dark:text-teal-400"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span className="text-neutral-700 dark:text-neutral-200">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {" "}
                      — {item.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Section 5: Trust promise */}
      <section className="bg-neutral-50 dark:bg-neutral-900/50">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-bold text-neutral-900 sm:text-3xl dark:text-white">
            Source quality you can see
          </h2>
          <p className="mt-3 text-base text-neutral-500 dark:text-neutral-400">
            Every opportunity shows where it came from and how we verified it.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <SourceTrustBadge category="government" />
            <SourceTrustBadge category="university" />
            <SourceTrustBadge category="official_provider" />
            <SourceTrustBadge category="foundation_or_nonprofit" />
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            We prefer official sources over aggregators. When an opportunity comes
            from a secondary source, we tell you — and we look for the official
            provider page.
          </p>
        </div>
      </section>

      {/* Section 6: CTA */}
      <section className="bg-indigo-600 dark:bg-indigo-800">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Ready to find your next opportunity?
          </h2>
          <p className="mt-3 text-base text-indigo-200">
            Create a free account to get personalized scores and save
            opportunities.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-lg bg-white px-8 py-3 font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
          >
            Get started free
          </Link>
          <p className="mt-4 text-sm text-indigo-200">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-white underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
