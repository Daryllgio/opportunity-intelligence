import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Create your account",
};

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col bg-white dark:bg-neutral-950">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-6">
        <Link
          href="/"
          className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100"
        >
          OppScore
        </Link>
      </header>

      <div className="flex flex-1 items-start justify-center px-6 pt-16 sm:pt-20">
        <div className="w-full max-w-sm">
          <SignupForm />
          <p className="mt-8 text-center text-sm text-neutral-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-neutral-900 underline underline-offset-2 dark:text-neutral-100"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
