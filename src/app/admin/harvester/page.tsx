"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { buildAuthedJsonHeaders } from "@/lib/api/auth-headers";
import { normalizeUrl } from "@/lib/utils/url-normalizer";

type Source = {
  id: string;
  name: string;
  url: string;
  normalized_url?: string | null;
  source_type: string;
  country: string | null;
  categories: string[] | null;
  check_frequency: string | null;
  is_active: boolean;
};

type CandidateLink = {
  title: string;
  url: string;
  reason: string;
  score: number;
  status?: string;
};

type StoredCandidate = {
  id: string;
  source_id: string | null;
  title: string;
  url: string;
  normalized_url?: string | null;
  reason: string | null;
  score: number | null;
  status: string | null;
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

function formatSourceType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatStatus(status?: string | null) {
  if (!status) return "New";

  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function statusVariant(status?: string | null) {
  if (status === "ignored") return "outline";
  if (status === "saved_as_source") return "secondary";
  if (status === "sent_to_extract") return "secondary";
  return "default";
}

export default function AdminHarvesterPage() {
  const searchParams = useSearchParams();
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [candidates, setCandidates] = useState<CandidateLink[]>([]);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);

  useEffect(() => {
    loadSources();
    loadScanLogs();
  }, []);

  useEffect(() => {
    const incomingSourceId = searchParams.get("source");
    if (incomingSourceId) {
      setSelectedSourceId(incomingSourceId);
      setManualUrl("");
    }
  }, [searchParams]);

  async function loadSources() {
    const { data } = await supabase
      .from("opportunity_sources")
      .select(
        "id, name, url, normalized_url, source_type, country, categories, check_frequency, is_active"
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    setSources((data || []) as Source[]);
  }

  async function loadScanLogs() {
    const { data } = await supabase
      .from("harvester_scan_logs")
      .select(
        "id, source_id, source_url, status, total_candidates, new_candidates, ignored_candidates, error_message, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(8);

    setScanLogs((data || []) as ScanLog[]);
  }

  const selectedSource = sources.find((source) => source.id === selectedSourceId);
  const scanUrl = manualUrl || selectedSource?.url || "";

  function inferSourceType(candidate: CandidateLink) {
    const combined = `${candidate.title} ${candidate.url}`.toLowerCase();

    if (combined.includes("research")) return "research_program_page";
    if (combined.includes("conference") || combined.includes("summit")) {
      return "conference_funding_page";
    }
    if (combined.includes("fellowship")) return "fellowship_page";
    if (
      combined.includes("award") ||
      combined.includes("funding") ||
      combined.includes("scholarship") ||
      combined.includes("bursary")
    ) {
      return "scholarship_portal";
    }

    if (combined.includes("government")) return "government_opportunity_page";
    if (combined.includes("nonprofit")) return "nonprofit_opportunity_page";

    return "general_opportunity_site";
  }

  function inferCategories(candidate: CandidateLink) {
    const combined = `${candidate.title} ${candidate.url}`.toLowerCase();
    const categories: string[] = [];

    if (combined.includes("scholarship")) categories.push("Scholarships");
    if (combined.includes("award")) categories.push("Awards");
    if (combined.includes("funding")) categories.push("Funding");
    if (combined.includes("research")) categories.push("Research");
    if (combined.includes("fellowship")) categories.push("Fellowships");
    if (combined.includes("grant")) categories.push("Grants");
    if (combined.includes("conference")) categories.push("Funded Conferences");
    if (combined.includes("competition")) categories.push("Competitions");

    return categories.length > 0 ? categories : ["Opportunities"];
  }

  async function createScanLog({
    status,
    totalCandidates,
    newCandidates,
    ignoredCandidates,
    errorMessage,
  }: {
    status: "success" | "failed";
    totalCandidates: number;
    newCandidates: number;
    ignoredCandidates: number;
    errorMessage?: string;
  }) {
    const now = new Date().toISOString();

    await supabase.from("harvester_scan_logs").insert({
      source_id: selectedSourceId || null,
      source_url: scanUrl,
      status,
      total_candidates: totalCandidates,
      new_candidates: newCandidates,
      ignored_candidates: ignoredCandidates,
      error_message: errorMessage || null,
    });

    if (selectedSourceId) {
      await supabase
        .from("opportunity_sources")
        .update({
          last_checked_at: now,
          updated_at: now,
        })
        .eq("id", selectedSourceId);
    }

    await loadScanLogs();
    await loadSources();
  }

  async function upsertCandidate(candidate: CandidateLink, status = "new") {
    const { error } = await supabase.from("harvester_candidates").upsert(
      {
        source_id: selectedSourceId || null,
        title: candidate.title,
        url: candidate.url,
        normalized_url: normalizeUrl(candidate.url),
        reason: candidate.reason,
        score: candidate.score,
        status,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "url",
      }
    );

    if (error) {
      setMessage(error.message);
      return false;
    }

    return true;
  }

  async function loadStoredCandidateStatuses(urls: string[]) {
    if (urls.length === 0) return new Map<string, string>();

    const { data } = await supabase
      .from("harvester_candidates")
      .select("url, normalized_url, status")
      .in("url", urls);

    const statusMap = new Map<string, string>();

    ((data || []) as StoredCandidate[]).forEach((candidate) => {
      statusMap.set(candidate.normalized_url || normalizeUrl(candidate.url), candidate.status || "new");
    });

    return statusMap;
  }

  async function scanSource() {
    setMessage("");
    setCandidates([]);

    if (!scanUrl.trim()) {
      setMessage("Choose a source or paste a source URL first.");
      return;
    }

    setScanning(true);

    try {
      const response = await fetch("/api/scan-source", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: scanUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        const errorMessage = result.error || "Could not scan source.";

        await createScanLog({
          status: "failed",
          totalCandidates: 0,
          newCandidates: 0,
          ignoredCandidates: 0,
          errorMessage,
        });

        setMessage(errorMessage);
        setScanning(false);
        return;
      }

      const scannedCandidates = (result.candidates || []) as CandidateLink[];
      const statusMap = await loadStoredCandidateStatuses(
        scannedCandidates.map((candidate) => normalizeUrl(candidate.url))
      );

      let newCandidateCount = 0;

      for (const candidate of scannedCandidates) {
        if (!statusMap.has(normalizeUrl(candidate.url))) {
          newCandidateCount += 1;
          await upsertCandidate(candidate, "new");
        }
      }

      const withStatus = scannedCandidates.map((candidate) => ({
        ...candidate,
        status: statusMap.get(normalizeUrl(candidate.url)) || "new",
      }));

      const ignoredCandidateCount = withStatus.filter(
        (candidate) => candidate.status === "ignored"
      ).length;

      setCandidates(withStatus);

      await createScanLog({
        status: "success",
        totalCandidates: scannedCandidates.length,
        newCandidates: newCandidateCount,
        ignoredCandidates: ignoredCandidateCount,
      });

      setMessage(
        `Scan completed. Found ${scannedCandidates.length} candidate links, including ${newCandidateCount} new.`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Something went wrong while scanning.";

      await createScanLog({
        status: "failed",
        totalCandidates: 0,
        newCandidates: 0,
        ignoredCandidates: 0,
        errorMessage,
      });

      setMessage(errorMessage);
    }

    setScanning(false);
  }

  async function updateCandidateStatus(candidate: CandidateLink, status: string) {
    setMessage("");

    const success = await upsertCandidate(candidate, status);

    if (!success) return;

    setCandidates((current) =>
      current.map((item) =>
        item.url === candidate.url ? { ...item, status } : item
      )
    );

    setMessage(`Candidate marked as ${formatStatus(status)}.`);
  }

  async function saveCandidateAsSource(candidate: CandidateLink) {
    setMessage("");

    const candidateNormalizedUrl = normalizeUrl(candidate.url);
    const alreadySaved = sources.some((source) => (source.normalized_url || normalizeUrl(source.url)) === candidateNormalizedUrl);

    if (alreadySaved) {
      await updateCandidateStatus(candidate, "saved_as_source");
      setMessage("This candidate is already saved as a source.");
      return;
    }

    const { error } = await supabase.from("opportunity_sources").insert({
      name: candidate.title,
      url: candidate.url,
      normalized_url: normalizeUrl(candidate.url),
      source_type: inferSourceType(candidate),
      country: selectedSource?.country || "Global",
      categories: inferCategories(candidate),
      check_frequency: selectedSource?.check_frequency || "weekly",
      is_active: true,
      notes: `Saved from harvester scan. Candidate score: ${candidate.score}. ${candidate.reason}`,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      if (
        error.message.includes("opportunity_sources_normalized_url_unique") ||
        error.message.toLowerCase().includes("duplicate key")
      ) {
        setMessage("This candidate is already saved as a source.");
      } else {
        setMessage(error.message);
      }
      return;
    }

    await updateCandidateStatus(candidate, "saved_as_source");
    await loadSources();
    setMessage("Candidate saved as a new tracked source.");
  }

  async function markSourceChecked() {
    if (!selectedSourceId) return;

    const { error } = await supabase
      .from("opportunity_sources")
      .update({
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedSourceId);

    if (!error) {
      setMessage("Source marked as checked.");
    }
  }

  const visibleCandidates = showIgnored
    ? candidates.filter((candidate) => candidate.status === "ignored")
    : candidates.filter((candidate) => candidate.status !== "ignored");

  const ignoredCount = candidates.filter(
    (candidate) => candidate.status === "ignored"
  ).length;

  const newCount = candidates.filter(
    (candidate) => !candidate.status || candidate.status === "new"
  ).length;

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Badge variant="secondary">Admin · Harvester</Badge>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Source harvester
          </h1>

          <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <p className="max-w-3xl text-muted-foreground">
              Scan a tracked source page for possible opportunity links. Save
              listing pages as sources, extract actual opportunities, and ignore
              irrelevant links.
            </p>

            <Button asChild variant="outline">
              <Link href="/admin/harvester/logs">View scan history</Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[0.42fr_1fr]">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold">Scan source</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Choose an active source or paste a source URL. The scanner will
                  look for links that resemble opportunities.
                </p>

                <div className="mt-6 space-y-5">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Tracked source</p>
                    <select
                      value={selectedSourceId}
                      onChange={(event) => {
                        setSelectedSourceId(event.target.value);
                        setManualUrl("");
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select source</option>
                      {sources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Or paste source URL</p>
                    <input
                      value={manualUrl}
                      onChange={(event) => {
                        setManualUrl(event.target.value);
                        setSelectedSourceId("");
                      }}
                      placeholder="https://..."
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>

                  {selectedSource && (
                    <div className="rounded-xl border p-4">
                      <p className="font-medium">{selectedSource.name}</p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {selectedSource.url}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {formatSourceType(selectedSource.source_type)}
                        </Badge>

                        {selectedSource.country && (
                          <Badge variant="outline">
                            {selectedSource.country}
                          </Badge>
                        )}

                        {selectedSource.categories?.map((category) => (
                          <Badge key={category} variant="outline">
                            {category}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {message && (
                    <p className="text-sm text-muted-foreground">{message}</p>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={scanSource} disabled={scanning}>
                      {scanning ? "Scanning..." : "Scan source"}
                    </Button>

                    {selectedSourceId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={markSourceChecked}
                      >
                        Mark checked
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <h2 className="text-2xl font-semibold">Candidate links</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Review discovered links and choose the right action.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {visibleCandidates.length} visible
                    </Badge>
                    <Badge variant="outline">{newCount} new</Badge>
                    <Badge variant="outline">{ignoredCount} ignored</Badge>
                  </div>
                </div>

                {candidates.length > 0 && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowIgnored((current) => !current)}
                    >
                      {showIgnored ? "Show active" : "Show ignored"}
                    </Button>
                  </div>
                )}

                {visibleCandidates.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="p-8">
                      <h3 className="text-xl font-semibold">
                        No visible candidates
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Run a scan, or show ignored candidates if all results
                        were previously ignored.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3">
                    {visibleCandidates.map((candidate) => (
                      <Card key={candidate.url}>
                        <CardContent className="p-5">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary">
                                  Score: {candidate.score}
                                </Badge>
                                <Badge variant="outline">
                                  {candidate.reason}
                                </Badge>
                                <Badge variant={statusVariant(candidate.status)}>
                                  {formatStatus(candidate.status)}
                                </Badge>
                              </div>

                              <h3 className="mt-3 text-lg font-semibold">
                                {candidate.title}
                              </h3>

                              <a
                                href={candidate.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 block truncate text-sm text-muted-foreground underline"
                              >
                                {candidate.url}
                              </a>
                            </div>

                            <div className="flex flex-wrap gap-2 lg:w-48 lg:flex-col">
                              <Button asChild variant="outline">
                                <a
                                  href={candidate.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open
                                </a>
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => saveCandidateAsSource(candidate)}
                                disabled={
                                  candidate.status === "saved_as_source"
                                }
                              >
                                {candidate.status === "saved_as_source"
                                  ? "Saved source"
                                  : "Save as source"}
                              </Button>

                              <Button asChild>
                                <Link
                                  href={`/admin/extract?url=${encodeURIComponent(
                                    candidate.url
                                  )}`}
                                  onClick={() =>
                                    updateCandidateStatus(
                                      candidate,
                                      "sent_to_extract"
                                    )
                                  }
                                >
                                  Extract
                                </Link>
                              </Button>

                              {candidate.status === "ignored" ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    updateCandidateStatus(candidate, "new")
                                  }
                                >
                                  Unignore
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    updateCandidateStatus(candidate, "ignored")
                                  }
                                >
                                  Ignore
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
