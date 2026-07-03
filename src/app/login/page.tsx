import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
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

      <div className="flex flex-1 items-start justify-center px-6 pt-16 sm:pt-24">
        <div className="w-full max-w-sm">
          <LoginForm />
          <p className="mt-8 text-center text-sm text-neutral-500">
            New to OppScore?{" "}
            <Link
              href="/signup"
              className="font-medium text-neutral-900 underline underline-offset-2 dark:text-neutral-100"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
