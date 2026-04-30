"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

type Source = {
  id: string;
  name: string;
  url: string;
  source_type: string;
  country: string | null;
  categories: string[] | null;
  check_frequency: string | null;
  is_active: boolean;
  last_checked_at: string | null;
  created_at: string;
};

function formatSourceType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatFrequency(frequency: string | null) {
  if (!frequency) return "Weekly";

  return frequency
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getFrequencyDays(frequency: string | null) {
  if (frequency === "daily") return 1;
  if (frequency === "twice_weekly") return 3;
  if (frequency === "weekly") return 7;
  if (frequency === "biweekly") return 14;
  if (frequency === "monthly") return 30;
  return 7;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getScheduleStatus(source: Source) {
  if (!source.is_active) {
    return {
      status: "paused",
      label: "Paused",
      nextScanText: "Paused",
      daysUntilDue: null as number | null,
    };
  }

  if (!source.last_checked_at) {
    return {
      status: "due",
      label: "Needs first scan",
      nextScanText: "Scan now",
      daysUntilDue: 0,
    };
  }

  const lastChecked = new Date(source.last_checked_at);
  const nextScan = addDays(lastChecked, getFrequencyDays(source.check_frequency));
  const now = new Date();

  const diff = nextScan.getTime() - now.getTime();
  const daysUntilDue = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (daysUntilDue <= 0) {
    return {
      status: "due",
      label: "Due now",
      nextScanText: "Scan now",
      daysUntilDue: 0,
    };
  }

  return {
    status: "upcoming",
    label: "Upcoming",
    nextScanText: nextScan.toLocaleDateString(),
    daysUntilDue,
  };
}

export default function ScheduledScansPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("due");

  useEffect(() => {
    async function loadSources() {
      setLoading(true);

      const { data } = await supabase
        .from("opportunity_sources")
        .select(
          "id, name, url, source_type, country, categories, check_frequency, is_active, last_checked_at, created_at"
        )
        .order("created_at", { ascending: false });

      setSources((data || []) as Source[]);
      setLoading(false);
    }

    loadSources();
  }, []);

  const stats = useMemo(() => {
    const due = sources.filter(
      (source) => getScheduleStatus(source).status === "due"
    ).length;

    const upcoming = sources.filter(
      (source) => getScheduleStatus(source).status === "upcoming"
    ).length;

    const paused = sources.filter(
      (source) => getScheduleStatus(source).status === "paused"
    ).length;

    const active = sources.filter((source) => source.is_active).length;

    return { due, upcoming, paused, active };
  }, [sources]);

  const filteredSources = sources
    .filter((source) => {
      const query = search.toLowerCase();
      const schedule = getScheduleStatus(source);

      const matchesSearch =
        source.name.toLowerCase().includes(query) ||
        source.url.toLowerCase().includes(query) ||
        source.source_type.toLowerCase().includes(query) ||
        source.country?.toLowerCase().includes(query) ||
        source.categories?.join(" ").toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "all" || schedule.status === statusFilter;

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const aStatus = getScheduleStatus(a);
      const bStatus = getScheduleStatus(b);

      const aDays = aStatus.daysUntilDue ?? 9999;
      const bDays = bStatus.daysUntilDue ?? 9999;

      return aDays - bDays;
    });

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <Badge variant="secondary">Admin · Scheduled Scans</Badge>

              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Scheduled scan queue
              </h1>

              <p className="mt-3 max-w-3xl text-muted-foreground">
                See which sources are due for scanning based on their check
                frequency. This prepares the harvester for future automation.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/admin/sources">Manage sources</Link>
              </Button>

              <Button asChild>
                <Link href="/admin/harvester">Open harvester</Link>
              </Button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Due now</p>
                <h2 className="mt-2 text-3xl font-semibold">{stats.due}</h2>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Upcoming</p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {stats.upcoming}
                </h2>
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
                <p className="text-sm text-muted-foreground">Paused</p>
                <h2 className="mt-2 text-3xl font-semibold">{stats.paused}</h2>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-[1fr_220px]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search scheduled sources..."
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="due">Due now</option>
              <option value="upcoming">Upcoming</option>
              <option value="paused">Paused</option>
              <option value="all">All sources</option>
            </select>
          </div>

          {loading ? (
            <Card className="mt-6">
              <CardContent className="p-6">
                <p className="text-muted-foreground">
                  Loading scheduled scans...
                </p>
              </CardContent>
            </Card>
          ) : filteredSources.length === 0 ? (
            <Card className="mt-6 border-dashed">
              <CardContent className="p-8">
                <h2 className="text-xl font-semibold">No sources in this view</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Adjust the filter or add more tracked sources.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-6 grid gap-3">
              {filteredSources.map((source) => {
                const schedule = getScheduleStatus(source);

                return (
                  <Card key={source.id}>
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={
                                schedule.status === "due"
                                  ? "default"
                                  : schedule.status === "paused"
                                    ? "outline"
                                    : "secondary"
                              }
                            >
                              {schedule.label}
                            </Badge>

                            <Badge variant="outline">
                              {formatFrequency(source.check_frequency)}
                            </Badge>

                            <Badge variant="secondary">
                              {formatSourceType(source.source_type)}
                            </Badge>

                            {source.country && (
                              <Badge variant="outline">{source.country}</Badge>
                            )}
                          </div>

                          <h2 className="mt-3 text-lg font-semibold">
                            {source.name}
                          </h2>

                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block truncate text-sm text-muted-foreground underline"
                          >
                            {source.url}
                          </a>

                          <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
                            <div>
                              <p className="font-medium text-foreground">
                                Last checked
                              </p>
                              <p>
                                {source.last_checked_at
                                  ? new Date(
                                      source.last_checked_at
                                    ).toLocaleString()
                                  : "Not checked yet"}
                              </p>
                            </div>

                            <div>
                              <p className="font-medium text-foreground">
                                Next scan
                              </p>
                              <p>{schedule.nextScanText}</p>
                            </div>

                            <div>
                              <p className="font-medium text-foreground">
                                Source status
                              </p>
                              <p>{source.is_active ? "Active" : "Paused"}</p>
                            </div>
                          </div>

                          {source.categories && source.categories.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {source.categories.map((category) => (
                                <Badge key={category} variant="outline">
                                  {category}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 lg:w-44 lg:flex-col">
                          <Button asChild>
                            <Link href={`/admin/harvester?source=${source.id}`}>
                              Scan now
                            </Link>
                          </Button>

                          <Button asChild variant="outline">
                            <Link href="/admin/harvester/logs">
                              View logs
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
