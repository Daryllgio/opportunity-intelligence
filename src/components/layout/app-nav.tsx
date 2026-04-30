"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/saved", label: "Saved" },
  { href: "/profile", label: "Profile" },
  { href: "/pricing", label: "Pricing" },
  { href: "/admin/sources", label: "Sources" },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/dashboard" className="text-xl font-semibold tracking-tight">
          OppScore
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  isActive
                    ? "text-sm font-medium text-foreground"
                    : "text-sm text-muted-foreground hover:text-foreground"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Button variant="outline" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </header>
  );
}
