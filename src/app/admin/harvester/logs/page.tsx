"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

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
  opportunity_sources?: {
    name: string;
    url: string;
  } | null;
};

function formatStatus(status?: string | null) {
  if (!status) return "Unknown";

  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function HarvesterLogsPage() {
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function loadLogs() {
      setLoading(true);

      const { data } = await supabase
        .from("harvester_scan_logs")
        .select(
          `
          id,
          source_id,
          source_url,
          status,
          total_candidates,
          new_candidates,
          ignored_candidates,
          error_message,
          created_at,
          opportunity_sources (
            name,
            url
          )
        `
        )
        .order("created_at", { ascending: false })
        .limit(100);

      setLogs((data || []) as ScanLog[]);
      setLoading(false);
    }

    loadLogs();
  }, []);

  const stats = useMemo(() => {
    const total = logs.length;
    const successful = logs.filter((log) => log.status === "success").length;
    const failed = logs.filter((log) => log.status === "failed").length;
    const totalCandidates = logs.reduce(
      (sum, log) => sum + (log.total_candidates || 0),
      0
    );

    return { total, successful, failed, totalCandidates };
  }, [logs]);

  const filteredLogs = logs.filter((log) => {
    const query = search.toLowerCase();

    const sourceName = log.opportunity_sources?.name || "";
    const matchesSearch =
      log.source_url.toLowerCase().includes(query) ||
      sourceName.toLowerCase().includes(query) ||
      log.error_message?.toLowerCase().includes(query);

    const matchesStatus =
      statusFilter === "all" || log.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <Badge variant="secondary">Admin · Harvester Logs</Badge>

              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Scan history
              </h1>

              <p className="mt-3 max-w-3xl text-muted-foreground">
                Review scan activity, failures, and candidate counts from the
                harvester.
              </p>
            </div>

            <Button asChild variant="outline">
              <Link href="/admin/harvester">Back to harvester</Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Total scans</p>
                <h2 className="mt-2 text-3xl font-semibold">{stats.total}</h2>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Successful</p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {stats.successful}
                </h2>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Failed</p>
                <h2 className="mt-2 text-3xl font-semibold">{stats.failed}</h2>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">
                  Candidates found
                </p>
                <h2 className="mt-2 text-3xl font-semibold">
                  {stats.totalCandidates}
                </h2>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-[1fr_220px]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search scan logs..."
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {loading ? (
            <Card className="mt-6">
              <CardContent className="p-6">
                <p className="text-muted-foreground">Loading scan logs...</p>
              </CardContent>
            </Card>
          ) : filteredLogs.length === 0 ? (
            <Card className="mt-6 border-dashed">
              <CardContent className="p-8">
                <h2 className="text-xl font-semibold">No scan logs found</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Run a source scan first or adjust your filters.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-6 grid gap-3">
              {filteredLogs.map((log) => (
                <Card key={log.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              log.status === "success"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {formatStatus(log.status)}
                          </Badge>

                          <Badge variant="outline">
                            {log.total_candidates || 0} candidates
                          </Badge>

                          <Badge variant="outline">
                            {log.new_candidates || 0} new
                          </Badge>

                          <Badge variant="outline">
                            {log.ignored_candidates || 0} ignored
                          </Badge>
                        </div>

                        <h2 className="mt-3 text-lg font-semibold">
                          {log.opportunity_sources?.name || "Manual source scan"}
                        </h2>

                        <a
                          href={log.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block truncate text-sm text-muted-foreground underline"
                        >
                          {log.source_url}
                        </a>

                        {log.error_message && (
                          <p className="mt-3 text-sm text-destructive">
                            {log.error_message}
                          </p>
                        )}

                        <p className="mt-3 text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex gap-2 lg:flex-col">
                        {log.source_id && (
                          <Button asChild variant="outline">
                            <Link href={`/admin/harvester?source=${log.source_id}`}>
                              Scan again
                            </Link>
                          </Button>
                        )}

                        <Button asChild variant="outline">
                          <a
                            href={log.source_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open source
                          </a>
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
