import { AppNav } from "@/components/layout/app-nav";
import { PreferencesFlow } from "@/components/preferences/preferences-flow";

export const metadata = {
  title: "Preferences",
};

export default function PreferencesPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Preferences</h1>
        <p className="mt-1 max-w-xl text-[15px] text-neutral-500 dark:text-neutral-400">
          Your profile is who you are. This page is what you want to see —
          it shapes your catalog and what gets scored.
        </p>

        <div className="mt-8">
          <PreferencesFlow />
        </div>
      </main>
    </div>
  );
}
