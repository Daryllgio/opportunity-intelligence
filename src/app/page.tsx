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
          <span className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
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
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Section 1: Hero */}
      <section className="bg-white dark:bg-neutral-950">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:py-32">
          <p className="text-sm font-medium uppercase tracking-wider text-neutral-500">
            Opportunity Intelligence Platform
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl dark:text-white">
            Find opportunities that actually fit you
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-500 dark:text-neutral-400">
            Discover scholarships, research programs, fellowships, grants,
            competitions, and more — verified, scored, and matched to your
            profile.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="w-full rounded-lg bg-primary px-6 py-3 text-center font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
            >
              Create free account
            </Link>
            <Link
              href="/login"
              className="w-full rounded-lg border border-neutral-300 px-6 py-3 text-center font-medium text-neutral-700 transition-colors hover:bg-neutral-50 sm:w-auto dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-8 text-sm text-neutral-400">
            Trusted sources · Official verification · Personalized matching
          </p>
        </div>
      </section>

      {/* Section 2: Opportunity types */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-semibold text-neutral-900 sm:text-3xl dark:text-white">
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
                className={`block rounded-lg border border-neutral-200 border-l-2 ${style.border} bg-white p-4 transition-shadow hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900`}
              >
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
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
          <h2 className="text-center text-2xl font-semibold text-neutral-900 sm:text-3xl dark:text-white">
            How OppScore works
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
                <p className="text-sm font-medium text-neutral-400">
                  {item.step}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
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
        <h2 className="text-center text-2xl font-semibold text-neutral-900 sm:text-3xl dark:text-white">
          Built for opportunity decisions, not just search
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
              Google / Aggregators
            </h3>
            <ul className="mt-4 space-y-3">
              {DIFFERENTIATORS.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2 text-sm text-neutral-400"
                >
                  <span className="text-neutral-300" aria-hidden="true">
                    –
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">
              OppScore
            </h3>
            <ul className="mt-4 space-y-3">
              {DIFFERENTIATORS.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-sm">
                  <span
                    className="mt-0.5 text-green-700/70 dark:text-green-500/70"
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
          <h2 className="text-2xl font-semibold text-neutral-900 sm:text-3xl dark:text-white">
            Source quality you can see
          </h2>
          <p className="mt-3 text-base text-neutral-500 dark:text-neutral-400">
            Every opportunity shows where it came from and how we verified it.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
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
      <section className="border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-2xl font-semibold text-neutral-900 sm:text-3xl dark:text-white">
            Ready to find your next opportunity?
          </h2>
          <p className="mt-3 text-base text-neutral-500 dark:text-neutral-400">
            Create a free account to get personalized scores and save
            opportunities.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-lg bg-primary px-8 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get started free
          </Link>
          <p className="mt-4 text-sm text-neutral-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-neutral-700 underline dark:text-neutral-300"
            >
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
