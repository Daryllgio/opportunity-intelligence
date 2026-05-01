"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

type Opportunity = {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  ai_summary: string | null;
  country: string | null;
  funding_amount: string | null;
  deadline: string | null;
  is_active: boolean | null;
  is_approved: boolean | null;
  updated_at: string | null;
  created_at: string | null;
};

function formatType(type: string | null) {
  if (!type) return "Opportunity";

  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function AdminOpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadOpportunities();
  }, []);

  async function loadOpportunities() {
    setLoading(true);

    const { data, error } = await supabase
      .from("opportunities")
      .select(
        "id, title, provider, type, ai_summary, country, funding_amount, deadline, is_active, is_approved, updated_at, created_at"
      )
      .order("updated_at", { ascending: false });

    if (error) {
      setMessage(error.message);
    } else {
      setOpportunities((data || []) as Opportunity[]);
    }

    setLoading(false);
  }

  async function toggleActive(opportunity: Opportunity) {
    const { error } = await supabase
      .from("opportunities")
      .update({
        is_active: !opportunity.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opportunity.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadOpportunities();
  }

  const stats = useMemo(() => {
    const total = opportunities.length;
    const active = opportunities.filter((item) => item.is_active).length;
    const inactive = opportunities.filter((item) => !item.is_active).length;
    const approved = opportunities.filter((item) => item.is_approved).length;

    return { total, active, inactive, approved };
  }, [opportunities]);

  const filteredOpportunities = opportunities.filter((opportunity) => {
    const query = search.toLowerCase();

    const matchesSearch =
      opportunity.title.toLowerCase().includes(query) ||
      opportunity.provider?.toLowerCase().includes(query) ||
      opportunity.type?.toLowerCase().includes(query) ||
      opportunity.country?.toLowerCase().includes(query) ||
      opportunity.ai_summary?.toLowerCase().includes(query);

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && opportunity.is_active) ||
      (statusFilter === "inactive" && !opportunity.is_active) ||
      (statusFilter === "approved" && opportunity.is_approved);

    return matchesSearch && matchesStatus;
  });

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <Badge variant="secondary">Admin · Opportunities</Badge>

              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Live opportunity manager
              </h1>

              <p className="mt-3 max-w-3xl text-muted-foreground">
                Review, edit, activate, or pause opportunities already published
                to the student-facing database.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/admin">Admin home</Link>
              </Button>

              <Button asChild>
                <Link href="/admin/extract">Extract new</Link>
              </Button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Total</p>
                <h2 className="mt-2 text-3xl font-semibold">{stats.total}</h2>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Active</p>
                <h2 className="mt-2 text-3xl font-semibold">{stats.active}</h2>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Inactive</p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {stats.inactive}
                </h2>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Approved</p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {stats.approved}
                </h2>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-[1fr_220px]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search live opportunities..."
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="approved">Approved</option>
            </select>
          </div>

          {message && (
            <Card className="mt-6">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{message}</p>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <Card className="mt-6">
              <CardContent className="p-6">
                <p className="text-muted-foreground">
                  Loading opportunities...
                </p>
              </CardContent>
            </Card>
          ) : filteredOpportunities.length === 0 ? (
            <Card className="mt-6 border-dashed">
              <CardContent className="p-8">
                <h2 className="text-xl font-semibold">
                  No opportunities found
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Adjust your filters or extract a new opportunity.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-6 grid gap-3">
              {filteredOpportunities.map((opportunity) => (
                <Card key={opportunity.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">
                            {formatType(opportunity.type)}
                          </Badge>

                          <Badge
                            variant={
                              opportunity.is_active ? "default" : "outline"
                            }
                          >
                            {opportunity.is_active ? "Active" : "Paused"}
                          </Badge>

                          {opportunity.country && (
                            <Badge variant="outline">
                              {opportunity.country}
                            </Badge>
                          )}

                          {opportunity.deadline && (
                            <Badge variant="outline">
                              Deadline: {opportunity.deadline}
                            </Badge>
                          )}
                        </div>

                        <h2 className="mt-3 text-xl font-semibold">
                          {opportunity.title}
                        </h2>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {opportunity.provider || "No provider listed"}
                          {opportunity.funding_amount
                            ? ` · ${opportunity.funding_amount}`
                            : ""}
                        </p>

                        {opportunity.ai_summary && (
                          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                            {opportunity.ai_summary}
                          </p>
                        )}

                        <p className="mt-3 text-xs text-muted-foreground">
                          Last updated:{" "}
                          {opportunity.updated_at
                            ? new Date(opportunity.updated_at).toLocaleString()
                            : "Unknown"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:w-44 lg:flex-col">
                        <Button asChild>
                          <Link
                            href={`/admin/opportunities/${opportunity.id}/edit`}
                          >
                            Edit
                          </Link>
                        </Button>

                        <Button asChild variant="outline">
                          <Link href={`/opportunities/${opportunity.id}`}>
                            View live
                          </Link>
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => toggleActive(opportunity)}
                        >
                          {opportunity.is_active ? "Pause" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
