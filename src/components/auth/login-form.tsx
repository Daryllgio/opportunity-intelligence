"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.push("/opportunities");
    router.refresh();
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/opportunities`,
      },
    });

    if (error) {
      setMessage(error.message);
      setGoogleLoading(false);
    }
  }

  return (
    <div className="w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Sign in to see your matches and deadlines.
      </p>

      <Button
        type="button"
        variant="outline"
        className="mt-8 h-10 w-full"
        onClick={handleGoogleLogin}
        disabled={googleLoading}
      >
        {googleLoading ? "Connecting…" : "Continue with Google"}
      </Button>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-neutral-200 dark:border-neutral-800" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-3 text-neutral-400 dark:bg-neutral-950">
            or with email
          </span>
        </div>
      </div>

      <form onSubmit={handleLogin} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="loginEmail">Email</Label>
          <Input
            id="loginEmail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="h-10"
            required
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="loginPassword">Password</Label>
            <Link
              href="/reset-password"
              className="text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="loginPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
            className="h-10"
            required
          />
        </div>

        {message && <p className="text-sm text-red-600">{message}</p>}

        <Button className="h-10 w-full" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
