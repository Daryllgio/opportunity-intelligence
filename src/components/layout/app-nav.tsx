"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentUserProfile } from "@/lib/auth/admin";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { href: "/opportunities", label: "Opportunities" },
  { href: "/saved", label: "Saved" },
];

function initialsFrom(name: string | null, email: string | null) {
  const source = (name || email || "").trim();
  if (!source) return "U";
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active || !user) return;
      setEmail(user.email || null);
      setDisplayName(
        user.user_metadata?.full_name || user.user_metadata?.name || null
      );
    });

    getCurrentUserProfile()
      .then((result) => {
        if (active) setIsAdmin(Boolean(result.isAdmin));
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href);
  }

  function linkClasses(href: string) {
    return isActive(href)
      ? "relative px-3 py-1.5 text-sm font-medium text-neutral-900 after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-primary dark:text-neutral-100"
      : "px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100";
  }

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link
            href="/opportunities"
            className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100"
          >
            OppScore
          </Link>

          <nav className="hidden items-center md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={linkClasses(item.href)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                {initialsFrom(displayName, email)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate text-sm font-medium">
                  {displayName || "Account"}
                </span>
                {email && (
                  <span className="block truncate text-xs text-neutral-400">
                    {email}
                  </span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link href="/admin">Admin</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleLogout}>
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
            className="inline-flex items-center justify-center rounded-md p-2 text-neutral-600 hover:bg-neutral-100 md:hidden dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="border-t border-neutral-200 px-4 py-3 md:hidden dark:border-neutral-800">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={linkClasses(item.href)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/profile"
              onClick={() => setMobileOpen(false)}
              className={linkClasses("/profile")}
            >
              Profile
            </Link>
            <Link
              href="/settings"
              onClick={() => setMobileOpen(false)}
              className={linkClasses("/settings")}
            >
              Settings
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className={linkClasses("/admin")}
              >
                Admin
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
