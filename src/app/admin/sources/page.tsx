"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  notes: string | null;
  last_checked_at: string | null;
  created_at: string;
};

type ScanLog = {
  id: string;
  source_id: string | null;
  source_url: string;
  status: string;
  total_candidates: number | null;
  new_candidates: number | null;
  ignored_candidates: number | null;
  error_message: string | null;
  created_at: string;
};

type FormState = {
  name: string;
  url: string;
  source_type: string;
  country: string;
  categories: string;
  check_frequency: string;
  notes: string;
};

const initialState: FormState = {
  name: "",
  url: "",
  source_type: "scholarship_portal",
  country: "Global",
  categories: "Scholarships, Fellowships, Grants",
  check_frequency: "weekly",
  notes: "",
};

const sourceTypes = [
  { label: "Scholarship portal", value: "scholarship_portal" },
  { label: "University funding page", value: "university_funding_page" },
  { label: "Research program page", value: "research_program_page" },
  { label: "Conference funding page", value: "conference_funding_page" },
  { label: "Fellowship page", value: "fellowship_page" },
  { label: "Government opportunity page", value: "government_opportunity_page" },
  { label: "Nonprofit opportunity page", value: "nonprofit_opportunity_page" },
  { label: "General opportunity site", value: "general_opportunity_site" },
];

const checkFrequencies = [
  { label: "Daily", value: "daily" },
  { label: "Twice a week", value: "twice_weekly" },
  { label: "Weekly", value: "weekly" },
  { label: "Biweekly", value: "biweekly" },
  { label: "Monthly", value: "monthly" },
];

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatSourceType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatFrequency(frequency: string | null) {
  if (!frequency) return "Not set";

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

function getSourceHealth(source: Source) {
  if (!source.is_active) {
    return {
      label: "Paused",
      variant: "outline" as const,
      nextScanText: "Paused",
      overdue: false,
    };
  }

  if (!source.last_checked_at) {
    return {
      label: "Needs first scan",
      variant: "default" as const,
      nextScanText: "Scan now",
      overdue: true,
    };
  }

  const lastChecked = new Date(source.last_checked_at);
  const nextScan = addDays(lastChecked, getFrequencyDays(source.check_frequency));
  const now = new Date();
  const overdue = nextScan <= now;

  return {
    label: overdue ? "Due for scan" : "Healthy",
    variant: overdue ? ("default" as const) : ("secondary" as const),
    nextScanText: overdue ? "Scan now" : nextScan.toLocaleDateString(),
    overdue,
  };
}

function getLatestLogForSource(source: Source, logs: ScanLog[]) {
  return logs.find(
    (log) => log.source_id === source.id || log.source_url === source.url
  );
}

export default function AdminSourcesPage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [sources, setSources] = useState<Source[]>([]);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadPageData();
  }, []);

  async function loadPageData() {
    setLoading(true);

    const { data: sourceData } = await supabase
      .from("opportunity_sources")
      .select(
        "id, name, url, source_type, country, categories, check_frequency, is_active, notes, last_checked_at, created_at"
      )
      .order("created_at", { ascending: false });

    const { data: logData } = await supabase
      .from("harvester_scan_logs")
      .select(
        "id, source_id, source_url, status, total_candidates, new_candidates, ignored_candidates, error_message, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    setSources((sourceData || []) as Source[]);
    setScanLogs((logData || []) as ScanLog[]);
    setLoading(false);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    if (!form.name.trim()) {
      setMessage("Source name is required.");
      setSaving(false);
      return;
    }

    if (!form.url.trim()) {
      setMessage("Source URL is required.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("opportunity_sources").insert({
      name: form.name.trim(),
      url: form.url.trim(),
      source_type: form.source_type,
      country: form.country || "Global",
      categories: splitList(form.categories),
      check_frequency: form.check_frequency,
      is_active: true,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Source added successfully.");
    setForm(initialState);
    await loadPageData();
  }

  async function toggleSource(source: Source) {
    const { error } = await supabase
      .from("opportunity_sources")
      .update({
        is_active: !source.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id);

    if (!error) {
      await loadPageData();
    }
  }

  async function deleteSource(sourceId: string) {
    const confirmDelete = window.confirm(
      "Delete this source? This only removes the source from monitoring, not existing opportunities."
    );

    if (!confirmDelete) return;

    const { error } = await supabase
      .from("opportunity_sources")
      .delete()
      .eq("id", sourceId);

    if (!error) {
      await loadPageData();
    }
  }

  const sourceStats = useMemo(() => {
    const active = sources.filter((source) => source.is_active).length;
    const due = sources.filter((source) => getSourceHealth(source).overdue).length;
    const paused = sources.filter((source) => !source.is_active).length;
    const failedRecent = sources.filter((source) => {
      const latestLog = getLatestLogForSource(source, scanLogs);
      return latestLog?.status === "failed";
    }).length;

    return { active, due, paused, failedRecent };
  }, [sources, scanLogs]);

  const filteredSources = sources.filter((source) => {
    const query = search.toLowerCase();
    const health = getSourceHealth(source);
    const latestLog = getLatestLogForSource(source, scanLogs);

    const matchesSearch =
      source.name.toLowerCase().includes(query) ||
      source.url.toLowerCase().includes(query) ||
      source.source_type.toLowerCase().includes(query) ||
      source.country?.toLowerCase().includes(query) ||
      source.categories?.join(" ").toLowerCase().includes(query);

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && source.is_active) ||
      (statusFilter === "paused" && !source.is_active) ||
      (statusFilter === "due" && health.overdue) ||
      (statusFilter === "failed" && latestLog?.status === "failed");

    return matchesSearch && matchesStatus;
  });

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Badge variant="secondary">Admin · Sources</Badge>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Opportunity source registry
          </h1>

          <p className="mt-3 max-w-3xl text-muted-foreground">
            Manage trusted websites the harvester can monitor for scholarships,
            fellowships, research programs, grants, funded conferences, and
            competitions.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Active sources</p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {sourceStats.active}
                </h2>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Due for scan</p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {sourceStats.due}
                </h2>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Paused</p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {sourceStats.paused}
                </h2>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Recent failures</p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {sourceStats.failedRecent}
                </h2>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[0.45fr_1fr]">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold">Add source</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add specific opportunity listing pages, not general homepages.
                </p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                  <div className="space-y-2">
                    <Label>Source name</Label>
                    <Input
                      value={form.name}
                      onChange={(event) =>
                        updateField("name", event.target.value)
                      }
                      placeholder="Example: University awards page"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Source URL</Label>
                    <Input
                      value={form.url}
                      onChange={(event) =>
                        updateField("url", event.target.value)
                      }
                      placeholder="https://..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Source type</Label>
                    <select
                      value={form.source_type}
                      onChange={(event) =>
                        updateField("source_type", event.target.value)
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {sourceTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Country / region</Label>
                    <Input
                      value={form.country}
                      onChange={(event) =>
                        updateField("country", event.target.value)
                      }
                      placeholder="Global, Canada, United States..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Opportunity categories</Label>
                    <Input
                      value={form.categories}
                      onChange={(event) =>
                        updateField("categories", event.target.value)
                      }
                      placeholder="Scholarships, Research, Grants"
                    />
                    <p className="text-xs text-muted-foreground">
                      Separate categories with commas.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Check frequency</Label>
                    <select
                      value={form.check_frequency}
                      onChange={(event) =>
                        updateField("check_frequency", event.target.value)
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {checkFrequencies.map((frequency) => (
                        <option key={frequency.value} value={frequency.value}>
                          {frequency.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={form.notes}
                      onChange={(event) =>
                        updateField("notes", event.target.value)
                      }
                      placeholder="Any notes about what this source usually contains."
                    />
                  </div>

                  {message && (
                    <p className="text-sm text-muted-foreground">{message}</p>
                  )}

                  <Button type="submit" disabled={saving}>
                    {saving ? "Adding source..." : "Add source"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <h2 className="text-2xl font-semibold">Tracked sources</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Monitor source health and scan readiness.
                  </p>
                </div>

                <Badge variant="outline">{filteredSources.length} shown</Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search sources..."
                />

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="due">Due for scan</option>
                  <option value="paused">Paused</option>
                  <option value="failed">Recent failures</option>
                </select>
              </div>

              {loading ? (
                <Card>
                  <CardContent className="p-6">
                    <p className="text-muted-foreground">Loading sources...</p>
                  </CardContent>
                </Card>
              ) : filteredSources.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-8">
                    <h3 className="text-xl font-semibold">
                      No sources match this view
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Adjust your search or filters.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {filteredSources.map((source) => {
                    const health = getSourceHealth(source);
                    const latestLog = getLatestLogForSource(source, scanLogs);

                    return (
                      <Card key={source.id}>
                        <CardContent className="p-5">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">
                                  {formatSourceType(source.source_type)}
                                </Badge>

                                <Badge variant={health.variant}>
                                  {health.label}
                                </Badge>

                                {source.country && (
                                  <Badge variant="outline">
                                    {source.country}
                                  </Badge>
                                )}

                                <Badge variant="outline">
                                  {formatFrequency(source.check_frequency)}
                                </Badge>

                                {latestLog && (
                                  <Badge
                                    variant={
                                      latestLog.status === "success"
                                        ? "secondary"
                                        : "outline"
                                    }
                                  >
                                    Last scan: {latestLog.status}
                                  </Badge>
                                )}
                              </div>

                              <h3 className="mt-3 text-lg font-semibold">
                                {source.name}
                              </h3>

                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 block truncate text-sm text-muted-foreground underline"
                              >
                                {source.url}
                              </a>

                              {source.categories &&
                                source.categories.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {source.categories.map((category) => (
                                      <Badge key={category} variant="outline">
                                        {category}
                                      </Badge>
                                    ))}
                                  </div>
                                )}

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
                                    Next suggested scan
                                  </p>
                                  <p>{health.nextScanText}</p>
                                </div>

                                <div>
                                  <p className="font-medium text-foreground">
                                    Latest scan result
                                  </p>
                                  <p>
                                    {latestLog
                                      ? `${latestLog.total_candidates || 0} candidates, ${
                                          latestLog.new_candidates || 0
                                        } new`
                                      : "No scan log yet"}
                                  </p>
                                </div>
                              </div>

                              {latestLog?.error_message && (
                                <p className="mt-3 text-sm text-destructive">
                                  {latestLog.error_message}
                                </p>
                              )}

                              {source.notes && (
                                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                                  {source.notes}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2 lg:w-44 lg:flex-col">
                              <Button asChild>
                                <Link href={`/admin/harvester?source=${source.id}`}>
                                  Scan now
                                </Link>
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => toggleSource(source)}
                              >
                                {source.is_active ? "Pause" : "Activate"}
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => deleteSource(source.id)}
                              >
                                Delete
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
          </div>
        </div>
      </section>
    </main>
  );
}
