"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

type Source = {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  check_frequency: string | null;
  last_checked_at: string | null;
};

type Draft = {
  id: string;
  extraction_status: string | null;
};

type ScanLog = {
  id: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

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

function isSourceDue(source: Source) {
  if (!source.is_active) return false;
  if (!source.last_checked_at) return true;

  const lastChecked = new Date(source.last_checked_at);
  const nextScan = addDays(lastChecked, getFrequencyDays(source.check_frequency));

  return nextScan <= new Date();
}

const adminTools = [
  {
    title: "Sources",
    description: "Manage trusted opportunity websites and source health.",
    href: "/admin/sources",
  },
  {
    title: "Scheduled scans",
    description: "See which sources are due for scanning.",
    href: "/admin/scheduled-scans",
  },
  {
    title: "Harvester",
    description: "Scan sources and review candidate links.",
    href: "/admin/harvester",
  },
  {
    title: "Scan logs",
    description: "Review scan history, failures, and candidate counts.",
    href: "/admin/harvester/logs",
  },
  {
    title: "Extract",
    description: "Fetch/paste opportunity text and create structured drafts.",
    href: "/admin/extract",
  },
  {
    title: "Review queue",
    description: "Approve, reject, or mark extracted drafts.",
    href: "/admin/review",
  },
  {
    title: "Live opportunities",
    description: "Edit, pause, and manage approved opportunities.",
    href: "/admin/opportunities",
  },
];

export default function AdminPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [liveOpportunityCount, setLiveOpportunityCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [scoringMessage, setScoringMessage] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState("");

  useEffect(() => {
    async function loadAdminData() {
      setLoading(true);

      const { data: sourceData } = await supabase
        .from("opportunity_sources")
        .select("id, name, url, is_active, check_frequency, last_checked_at");

      const { data: draftData } = await supabase
        .from("opportunity_drafts")
        .select("id, extraction_status");

      const { data: logData } = await supabase
        .from("harvester_scan_logs")
        .select("id, status, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      const { count } = await supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true });

      setSources((sourceData || []) as Source[]);
      setDrafts((draftData || []) as Draft[]);
      setScanLogs((logData || []) as ScanLog[]);
      setLiveOpportunityCount(count || 0);
      setLoading(false);
    }

    loadAdminData();
  }, []);

  const stats = useMemo(() => {
    const activeSources = sources.filter((source) => source.is_active).length;
    const dueSources = sources.filter((source) => isSourceDue(source)).length;
    const pendingDrafts = drafts.filter(
      (draft) =>
        !draft.extraction_status ||
        draft.extraction_status === "pending_review" ||
        draft.extraction_status === "needs_review"
    ).length;
    const recentFailures = scanLogs.filter((log) => log.status === "failed").length;

    return {
      activeSources,
      dueSources,
      pendingDrafts,
      recentFailures,
    };
  }, [sources, drafts, scanLogs]);

  async function scoreNextOpportunities() {
    setScoring(true);
    setScoringMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setScoringMessage("Please log in again before scoring opportunities.");
      setScoring(false);
      return;
    }

    try {
      const response = await fetch("/api/score-opportunities-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          limit: 3,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        const rawError =
          typeof result.error === "string"
            ? result.error
            : result.error?.message || "Batch scoring failed.";

        const friendlyError = rawError.includes("high demand")
          ? "Gemini Pro is temporarily busy. Please try again in a few minutes."
          : rawError;

        setScoringMessage(friendlyError);
        setScoring(false);
        return;
      }

      const scoredCount = result.scores?.length || 0;
      const used = result.usage?.competitivenessScoresUsed;
      const limit = result.usage?.competitivenessScoresLimit;

      setScoringMessage(
        scoredCount > 0
          ? `Scored ${scoredCount} opportunities. Usage: ${used}/${limit} competitiveness scores.`
          : result.message || "No unscored opportunities found."
      );
    } catch (error) {
      setScoringMessage(
        error instanceof Error ? error.message : "Batch scoring failed."
      );
    }

    setScoring(false);
  }

  async function summarizeProfileExperiences() {
    setSummarizing(true);
    setSummaryMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setSummaryMessage("Please log in again before summarizing experiences.");
      setSummarizing(false);
      return;
    }

    try {
      const response = await fetch("/api/profile-experience-summaries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        const rawError =
          typeof result.error === "string"
            ? result.error
            : result.error?.message || "Experience summarization failed.";

        const friendlyError = rawError.includes("high demand")
          ? "Gemini Pro is temporarily busy. Please try again in a few minutes."
          : rawError;

        setSummaryMessage(friendlyError);
        setSummarizing(false);
        return;
      }

      const summarized = result.counts?.summarized || 0;
      const skipped = result.counts?.skipped || 0;
      const total = result.counts?.totalExperiences || 0;

      setSummaryMessage(
        result.message ||
          `Summarized ${summarized} experiences. Skipped ${skipped}. Total detected: ${total}.`
      );
    } catch (error) {
      setSummaryMessage(
        error instanceof Error
          ? error.message
          : "Experience summarization failed."
      );
    }

    setSummarizing(false);
  }

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <Badge variant="secondary">Admin</Badge>

              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Opportunity acquisition command center
              </h1>

              <p className="mt-3 max-w-3xl text-muted-foreground">
                Manage the source-to-review pipeline that powers OppScore’s
                opportunity database.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/admin/scheduled-scans">View schedule</Link>
              </Button>

              <Button asChild>
                <Link href="/admin/harvester">Open harvester</Link>
              </Button>
            </div>
          </div>

          {loading ? (
            <Card className="mt-8">
              <CardContent className="p-6">
                <p className="text-muted-foreground">Loading admin dashboard...</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mt-8 grid gap-4 md:grid-cols-5">
                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">Active sources</p>
                    <h2 className="mt-2 text-3xl font-semibold">
                      {stats.activeSources}
                    </h2>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">Due scans</p>
                    <h2 className="mt-2 text-3xl font-semibold">
                      {stats.dueSources}
                    </h2>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">Pending drafts</p>
                    <h2 className="mt-2 text-3xl font-semibold">
                      {stats.pendingDrafts}
                    </h2>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">Live opportunities</p>
                    <h2 className="mt-2 text-3xl font-semibold">
                      {liveOpportunityCount}
                    </h2>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-5">
                    <p className="text-sm text-muted-foreground">Recent failures</p>
                    <h2 className="mt-2 text-3xl font-semibold">
                      {stats.recentFailures}
                    </h2>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.75fr]">
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold">Admin tools</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Use these tools to manage source discovery, extraction,
                      review, and publishing.
                    </p>

                    <div className="mt-6 grid gap-3 md:grid-cols-2">
                      {adminTools.map((tool) => (
                        <Link
                          key={tool.href}
                          href={tool.href}
                          className="rounded-xl border p-4 transition hover:bg-muted/40"
                        >
                          <h3 className="font-medium">{tool.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {tool.description}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-xl font-semibold">Pipeline status</h2>

                      <div className="mt-5 space-y-4">
                        <div className="rounded-xl border p-4">
                          <p className="font-medium">1. Source registry</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {sources.length} sources are stored for monitoring.
                          </p>
                        </div>

                        <div className="rounded-xl border p-4">
                          <p className="font-medium">2. Harvester discovery</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Candidate links can be scanned, ignored, extracted,
                            or saved as new sources.
                          </p>
                        </div>

                        <div className="rounded-xl border p-4">
                          <p className="font-medium">3. Extraction + review</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {stats.pendingDrafts} drafts currently need review.
                          </p>
                        </div>

                        <div className="rounded-xl border p-4">
                          <p className="font-medium">4. Student database</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {liveOpportunityCount} approved opportunities are
                            visible to students.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-xl font-semibold">
                        Profile intelligence
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        Generate or update saved experience summaries for the current user. OppScore uses these summaries to improve competitiveness scoring without repeatedly sending full profile details.
                      </p>

                      <Button
                        type="button"
                        className="mt-5"
                        onClick={summarizeProfileExperiences}
                        disabled={summarizing}
                      >
                        {summarizing
                          ? "Summarizing..."
                          : "Update experience summaries"}
                      </Button>

                      {summaryMessage && (
                        <p className="mt-4 text-sm text-muted-foreground">
                          {summaryMessage}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-xl font-semibold">
                        Competitiveness scoring
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        Score the next eligible unscored opportunities for the current user. OppScore applies eligibility and profile-fit filters before sending opportunities to Gemini Pro.
                      </p>

                      <Button
                        type="button"
                        className="mt-5"
                        onClick={scoreNextOpportunities}
                        disabled={scoring}
                      >
                        {scoring ? "Scoring..." : "Score eligible opportunities"}
                      </Button>

                      {scoringMessage && (
                        <p className="mt-4 text-sm text-muted-foreground">
                          {scoringMessage}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
