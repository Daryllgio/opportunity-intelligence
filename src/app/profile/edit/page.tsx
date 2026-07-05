import { AppNav } from "@/components/layout/app-nav";
import { ProfileForm } from "@/components/profile/profile-form";

export const metadata = {
  title: "Edit profile",
};

export default function EditProfilePage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Edit profile</h1>
        <p className="mt-1 max-w-xl text-[15px] text-neutral-500 dark:text-neutral-400">
          Everything here feeds your match scores. The more complete it is,
          the sharper the results.
        </p>

        <ProfileForm />
      </main>
    </div>
  );
}
