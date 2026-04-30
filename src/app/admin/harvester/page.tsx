"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
};

type CandidateLink = {
  title: string;
  url: string;
  reason: string;
  score: number;
};

function formatSourceType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function AdminHarvesterPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [candidates, setCandidates] = useState<CandidateLink[]>([]);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");
  const [savedSourceUrls, setSavedSourceUrls] = useState<string[]>([]);

  useEffect(() => {
    async function loadSources() {
      const { data } = await supabase
        .from("opportunity_sources")
        .select(
          "id, name, url, source_type, country, categories, check_frequency, is_active"
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      setSources((data || []) as Source[]);
    }

    loadSources();
  }, []);

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

  async function saveCandidateAsSource(candidate: CandidateLink) {
    setMessage("");

    const alreadySaved =
      savedSourceUrls.includes(candidate.url) ||
      sources.some((source) => source.url === candidate.url);

    if (alreadySaved) {
      setMessage("This candidate is already saved as a source.");
      return;
    }

    const { error } = await supabase.from("opportunity_sources").insert({
      name: candidate.title,
      url: candidate.url,
      source_type: inferSourceType(candidate),
      country: selectedSource?.country || "Global",
      categories: inferCategories(candidate),
      check_frequency: selectedSource?.check_frequency || "weekly",
      is_active: true,
      notes: `Saved from harvester scan. Candidate score: ${candidate.score}. ${candidate.reason}`,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setSavedSourceUrls((current) => [...current, candidate.url]);
    setMessage("Candidate saved as a new tracked source.");
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
        setMessage(result.error || "Could not scan source.");
        setScanning(false);
        return;
      }

      setCandidates(result.candidates || []);
      setMessage(
        `Scan completed. Found ${result.totalCandidates || 0} candidate links.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while scanning."
      );
    }

    setScanning(false);
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

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Badge variant="secondary">Admin · Harvester</Badge>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Source harvester
          </h1>

          <p className="mt-3 max-w-3xl text-muted-foreground">
            Scan a tracked source page for possible opportunity links. This is
            the first step toward automated opportunity discovery.
          </p>

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

            <div className="space-y-4">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <h2 className="text-2xl font-semibold">Candidate links</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These links may contain individual opportunities. Send the
                    best ones to extraction.
                  </p>
                </div>

                <Badge variant="outline">{candidates.length} found</Badge>
              </div>

              {candidates.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-8">
                    <h3 className="text-xl font-semibold">
                      No candidates yet
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Run a scan to find possible opportunity pages from a
                      source.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {candidates.map((candidate) => (
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

                          <div className="flex gap-2 lg:flex-col">
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
                                savedSourceUrls.includes(candidate.url) ||
                                sources.some((source) => source.url === candidate.url)
                              }
                            >
                              {savedSourceUrls.includes(candidate.url) ||
                              sources.some((source) => source.url === candidate.url)
                                ? "Saved source"
                                : "Save as source"}
                            </Button>

                            <Button asChild>
                              <Link
                                href={`/admin/extract?url=${encodeURIComponent(
                                  candidate.url
                                )}`}
                              >
                                Extract
                              </Link>
                            </Button>
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
      </section>
    </main>
  );
}
