import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 dark:bg-neutral-950">
      <p className="text-sm font-medium text-neutral-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        This page doesn&apos;t exist
      </h1>
      <p className="mt-3 max-w-md text-center text-sm leading-6 text-neutral-500 dark:text-neutral-400">
        The opportunity may have been removed, or the link may be out of date.
        Everything currently open is on the browse page.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/opportunities"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Browse opportunities
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
