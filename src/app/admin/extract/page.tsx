"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { extractOpportunityDraft } from "@/lib/extraction/opportunity-extractor";

type Source = {
  id: string;
  name: string;
  url: string;
};

type ExtractedDraft = ReturnType<typeof extractOpportunityDraft>;

export default function AdminExtractPage() {
  const searchParams = useSearchParams();
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [preview, setPreview] = useState<ExtractedDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const incomingUrl = searchParams.get("url");
    if (incomingUrl) {
      setSourceUrl(incomingUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadSources() {
      const { data } = await supabase
        .from("opportunity_sources")
        .select("id, name, url")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      setSources((data || []) as Source[]);
    }

    loadSources();
  }, []);

  async function fetchUrlText() {
    setMessage("");

    if (!sourceUrl.trim()) {
      setMessage("Paste a source/application URL first.");
      return;
    }

    setFetchingUrl(true);

    try {
      const response = await fetch("/api/extract-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: sourceUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Could not fetch URL text.");
        setFetchingUrl(false);
        return;
      }

      setRawText(result.text || "");
      setMessage("URL text fetched successfully. Review the text, then click Extract draft.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while fetching the URL."
      );
    }

    setFetchingUrl(false);
  }

  async function handleExtract() {
    setMessage("");

    if (!rawText.trim()) {
      setMessage("Paste opportunity text before extracting.");
      return;
    }

    const selectedSource = sources.find((source) => source.id === sourceId);
    const finalSourceUrl = sourceUrl || selectedSource?.url || "";

    try {
      const response = await fetch("/api/ai-extract-opportunity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rawText,
          sourceUrl: finalSourceUrl,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Claude extraction failed. Using fallback extractor.");

        const fallback = extractOpportunityDraft({
          rawText,
          sourceUrl: finalSourceUrl,
        });

        setPreview(fallback);
        return;
      }

      setPreview(result.extracted);
      setMessage("Claude extraction completed. Review the preview before saving.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Claude extraction failed. Using fallback extractor."
      );

      const fallback = extractOpportunityDraft({
        rawText,
        sourceUrl: finalSourceUrl,
      });

      setPreview(fallback);
    }
  }

  async function saveDraft() {
    if (!preview) return;

    setSaving(true);
    setMessage("");

    const { error } = await supabase.from("opportunity_drafts").insert({
      source_id: sourceId || null,
      title: preview.title,
      provider: preview.provider || null,
      type: preview.type,
      description: preview.description,
      ai_summary: preview.ai_summary,
      country: preview.country,
      eligible_countries: preview.eligible_countries,
      eligible_education_levels: preview.eligible_education_levels,
      eligible_fields: preview.eligible_fields,
      funding_amount: preview.funding_amount || null,
      funding_type: preview.funding_type || null,
      deadline: preview.deadline,
      application_url: preview.application_url || null,
      effort_level: preview.effort_level,
      reward_level: preview.reward_level,
      competitiveness_factors: preview.competitiveness_factors,
      source_url: preview.application_url || sourceUrl || null,
      extraction_status: "pending_review",
      extraction_confidence: preview.extraction_confidence,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Draft created successfully. Review it in the review queue.");
    setPreview(null);
    setRawText("");
    setSourceUrl("");
    setSourceId("");
  }

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Badge variant="secondary">Admin · Extract</Badge>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Extract opportunity draft
          </h1>

          <p className="mt-3 max-w-3xl text-muted-foreground">
            Paste opportunity text or fetch page text from a URL. Claude will extract a structured draft for review.
            This is the controlled version of the future AI extraction pipeline.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[0.55fr_1fr]">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold">Input</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Paste the opportunity page content manually, or paste a URL and use Fetch URL text.
                </p>

                <div className="mt-6 space-y-5">
                  <div className="space-y-2">
                    <Label>Linked source</Label>
                    <select
                      value={sourceId}
                      onChange={(event) => setSourceId(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">No linked source</option>
                      {sources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Source / application URL</Label>
                    <Input
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder="https://..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Opportunity text</Label>
                    <Textarea
                      value={rawText}
                      onChange={(event) => setRawText(event.target.value)}
                      placeholder="Paste the opportunity description, eligibility, deadline, funding, and application details here."
                      className="min-h-72"
                    />
                  </div>

                  {message && (
                    <p className="text-sm text-muted-foreground">{message}</p>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={fetchUrlText}
                      disabled={fetchingUrl}
                    >
                      {fetchingUrl ? "Fetching URL..." : "Fetch URL text"}
                    </Button>

                    <Button type="button" onClick={handleExtract}>
                      Extract draft
                    </Button>

                    <Button asChild type="button" variant="outline">
                      <Link href="/admin/review">Go to review queue</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold">Extraction preview</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Review the structured output before saving it as a draft.
                  </p>

                  {!preview ? (
                    <div className="mt-6 rounded-xl border border-dashed p-6">
                      <p className="text-sm text-muted-foreground">
                        No preview yet. Paste text and click Extract draft.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-6 space-y-5">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{preview.type}</Badge>
                        <Badge variant="outline">
                          Confidence: {preview.extraction_confidence}
                        </Badge>
                        {preview.deadline && (
                          <Badge variant="outline">
                            Deadline: {preview.deadline}
                          </Badge>
                        )}
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">Title</p>
                        <h3 className="mt-1 text-2xl font-semibold">
                          {preview.title}
                        </h3>
                      </div>

                      <div className="rounded-xl border p-4">
                        <p className="text-sm font-medium">AI summary</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {preview.ai_summary}
                        </p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border p-4">
                          <p className="text-sm font-medium">Eligibility</p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Countries: {preview.eligible_countries.join(", ")}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Levels:{" "}
                            {preview.eligible_education_levels.join(", ")}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Fields: {preview.eligible_fields.join(", ")}
                          </p>
                        </div>

                        <div className="rounded-xl border p-4">
                          <p className="text-sm font-medium">Funding & effort</p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Funding: {preview.funding_amount || "Not detected"}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Effort: {preview.effort_level}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Reward: {preview.reward_level}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium">
                          Competitiveness factors
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {preview.competitiveness_factors.map((factor) => (
                            <Badge key={factor} variant="outline">
                              {factor}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <Button onClick={saveDraft} disabled={saving}>
                        {saving ? "Saving draft..." : "Save to review queue"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold">Important note</h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    This extractor is currently a local rule-based mock. It
                    proves the workflow. Later, we will replace the extraction
                    logic with a real AI model that reads pages more accurately.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
