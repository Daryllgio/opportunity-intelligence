"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUserProfile } from "@/lib/auth/admin";

type AdminGuardProps = {
  children: React.ReactNode;
};

export function AdminGuard({ children }: AdminGuardProps) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      const result = await getCurrentUserProfile();
      setIsAdmin(result.isAdmin);
      setLoading(false);
    }

    checkAdmin();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Checking access...</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardContent className="p-8">
              <h1 className="text-3xl font-semibold tracking-tight">
                Admin access required
              </h1>

              <p className="mt-3 text-muted-foreground">
                This area is only available to OppScore administrators.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/dashboard">Go to dashboard</Link>
                </Button>

                <Button asChild variant="outline">
                  <Link href="/opportunities">View opportunities</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
