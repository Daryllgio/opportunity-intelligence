"use client";

import { useEffect, useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { normalizeUrl } from "@/lib/utils/url-normalizer";
import { updateOpportunityWithLifecycle } from "@/lib/opportunities/update-opportunity";

type DraftOpportunity = {
  id: string;
  source_id: string | null;
  title: string;
  provider: string | null;
  type: string;
  description: string | null;
  ai_summary: string | null;
  country: string | null;
  eligible_countries: string[] | null;
  eligible_education_levels: string[] | null;
  eligible_fields: string[] | null;
  funding_amount: string | null;
  funding_type: string | null;
  deadline: string | null;
  application_url: string | null;
  effort_level: string | null;
  reward_level: string | null;
  competitiveness_factors: string[] | null;
  source_url: string | null;
  normalized_url?: string | null;
  extraction_status: string | null;
  extraction_confidence: string | null;
  review_notes: string | null;
  created_at: string;
  opportunity_sources?: {
    name: string;
    url: string;
  } | null;
};

function formatOpportunityType(type: string) {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatStatus(status: string | null) {
  if (!status) return "Pending Review";

  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function badgeVariantForStatus(status: string | null) {
  if (status === "approved") return "secondary";
  if (status === "rejected") return "outline";
  if (status === "duplicate") return "outline";
  return "default";
}

export default function AdminReviewPage() {
  const [drafts, setDrafts] = useState<DraftOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [duplicateMatches, setDuplicateMatches] = useState<
    Record<string, { id: string; title: string }>
  >({});

  useEffect(() => {
    loadDrafts();
  }, []);

  async function loadDrafts() {
    setLoading(true);

    const { data, error } = await supabase
      .from("opportunity_drafts")
      .select(
        `
        id,
        source_id,
        title,
        provider,
        type,
        description,
        ai_summary,
        country,
        eligible_countries,
        eligible_education_levels,
        eligible_fields,
        funding_amount,
        funding_type,
        deadline,
        application_url,
        effort_level,
        reward_level,
        competitiveness_factors,
        source_url,
        normalized_url,
        extraction_status,
        extraction_confidence,
        review_notes,
        created_at,
        opportunity_sources (
          name,
          url
        )
      `
      )
      .or("extraction_status.is.null,extraction_status.in.(pending_review,needs_review)")
        .order("created_at", { ascending: false });

    if (!error) {
      const loadedDrafts = ((data ?? []) as unknown as Array<
        Record<string, unknown>
      >).map((draft) => ({
        ...draft,
        opportunity_sources: Array.isArray(draft.opportunity_sources)
          ? draft.opportunity_sources[0] || null
          : draft.opportunity_sources,
      })) as unknown as DraftOpportunity[];

      setDrafts(loadedDrafts);

      const initialNotes: Record<string, string> = {};
      loadedDrafts.forEach((draft) => {
        initialNotes[draft.id] = draft.review_notes || "";
      });
      setNotes(initialNotes);
    } else {
      setMessage(error.message);
    }

    setLoading(false);
  }

  async function updateDraftStatus(
    draftId: string,
    status: "pending_review" | "approved" | "rejected" | "duplicate" | "needs_review"
  ) {
    setMessage("");

    const { error } = await supabase
      .from("opportunity_drafts")
      .update({
        extraction_status: status,
        review_notes: notes[draftId] || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadDrafts();
  }

  async function approveDraft(draft: DraftOpportunity) {
    setMessage(
      "Publishing: finding and verifying the application destination. This reads the live page and can take a minute."
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    try {
      const response = await fetch("/api/admin/publish-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token
            ? `Bearer ${session.access_token}`
            : "",
        },
        body: JSON.stringify({ draftId: draft.id }),
      });

      const result = await response.json();

      if (response.status === 409 && result.duplicateId) {
        setDuplicateMatches((current) => ({
          ...current,
          [draft.id]: { id: result.duplicateId, title: draft.title ?? "" },
        }));
        setMessage(result.error);
        return;
      }

      if (!response.ok) {
        setMessage(
          result.reasons
            ? `${result.error} ${result.reasons[0] || ""}`
            : result.error || "Publish failed."
        );
        await loadDrafts();
        return;
      }

      setMessage(
        `Published with verified destination: ${result.applicationUrl}`
      );
    } catch {
      setMessage("Publish failed. Please try again.");
    }
    await loadDrafts();
  }

  async function updateExistingOpportunityFromDraft(draft: DraftOpportunity) {
    const duplicate = duplicateMatches[draft.id];

    if (!duplicate) {
      setMessage("No duplicate opportunity selected for this draft.");
      return;
    }

    setMessage("");

    const draftUrl = draft.source_url || draft.application_url || "";
    const normalizedUrl = draft.normalized_url || normalizeUrl(draftUrl);

    let updateError: Error | null = null;

    try {
      // Content fields only. The live row's application_url stays as-is —
      // it was AI-verified at publish time and is re-verified on rotation;
      // a draft's stored URL must never overwrite a verified destination.
      await updateOpportunityWithLifecycle({
        supabase,
        opportunityId: duplicate.id,
        updates: {
          normalized_url: normalizedUrl || null,
          title: draft.title,
          provider: draft.provider,
          type: draft.type,
          description: draft.description,
          ai_summary: draft.ai_summary,
          country: draft.country || "Global",
          eligible_countries: draft.eligible_countries || [],
          eligible_education_levels: draft.eligible_education_levels || [],
          eligible_fields: draft.eligible_fields || [],
          funding_amount: draft.funding_amount,
          funding_type: draft.funding_type,
          deadline: draft.deadline,
          effort_level: draft.effort_level,
          reward_level: draft.reward_level,
          competitiveness_factors: draft.competitiveness_factors || [],
          is_active: true,
          is_approved: true,
        },
      });
    } catch (caughtError) {
      updateError =
        caughtError instanceof Error
          ? caughtError
          : new Error("Failed to update existing opportunity.");
    }

    if (updateError) {
      setMessage(updateError.message);
      return;
    }

    const { error: draftUpdateError } = await supabase
      .from("opportunity_drafts")
      .update({
        extraction_status: "merged",
        review_notes:
          notes[draft.id] ||
          `Merged into existing opportunity: ${duplicate.title}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draft.id);

    if (draftUpdateError) {
      setMessage(draftUpdateError.message);
      return;
    }

    setDuplicateMatches((current) => {
      const next = { ...current };
      delete next[draft.id];
      return next;
    });

    setMessage(`Existing opportunity updated from draft: ${draft.title}`);
    await loadDrafts();
  }

  async function deleteDraft(draftId: string) {
    const confirmDelete = window.confirm("Delete this draft permanently?");
    if (!confirmDelete) return;

    const { error } = await supabase
      .from("opportunity_drafts")
      .delete()
      .eq("id", draftId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadDrafts();
  }

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Badge variant="secondary">Admin · Review Queue</Badge>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Opportunity review queue
          </h1>

          <p className="mt-3 max-w-3xl text-muted-foreground">
            Review extracted opportunity drafts before they become visible to
            students. Later, this queue will be filled by the AI harvester.
          </p>

          {message && (
            <Card className="mt-6">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{message}</p>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <Card className="mt-8">
              <CardContent className="p-6">
                <p className="text-muted-foreground">Loading drafts...</p>
              </CardContent>
            </Card>
          ) : drafts.length === 0 ? (
            <Card className="mt-8 border-dashed">
              <CardContent className="p-8">
                <h2 className="text-xl font-semibold">No drafts yet</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Extracted opportunities will appear here for review before
                  they are published.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-8 grid gap-4">
              {drafts.map((draft) => (
                <Card key={draft.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">
                            {formatOpportunityType(draft.type)}
                          </Badge>

                          <Badge
                            variant={badgeVariantForStatus(
                              draft.extraction_status
                            )}
                          >
                            {formatStatus(draft.extraction_status)}
                          </Badge>

                          {draft.extraction_confidence && (
                            <Badge variant="outline">
                              Confidence: {draft.extraction_confidence}
                            </Badge>
                          )}

                          {draft.deadline && (
                            <Badge variant="outline">
                              Deadline: {draft.deadline}
                            </Badge>
                          )}

                          {draft.country && (
                            <Badge variant="outline">{draft.country}</Badge>
                          )}
                        </div>

                        <h2 className="mt-3 text-xl font-semibold">
                          {draft.title}
                        </h2>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {draft.provider || "Provider not specified"}
                          {draft.funding_amount &&
                            ` · ${draft.funding_amount}`}
                          {draft.reward_level &&
                            ` · ${draft.reward_level} reward`}
                        </p>

                        {draft.ai_summary && (
                          <div className="mt-4 rounded-xl border p-4">
                            <p className="text-sm font-medium">AI summary</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {draft.ai_summary}
                            </p>
                          </div>
                        )}

                        {draft.description && (
                          <div className="mt-4 rounded-xl border p-4">
                            <p className="text-sm font-medium">
                              Extracted description
                            </p>
                            <p className="mt-2 line-clamp-4 text-sm leading-6 text-muted-foreground">
                              {draft.description}
                            </p>
                          </div>
                        )}

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-xl border p-4">
                            <p className="text-sm font-medium">Eligibility</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              Countries:{" "}
                              {draft.eligible_countries?.join(", ") ||
                                "Not specified"}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Levels:{" "}
                              {draft.eligible_education_levels?.join(", ") ||
                                "Not specified"}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Fields:{" "}
                              {draft.eligible_fields?.join(", ") ||
                                "Not specified"}
                            </p>
                          </div>

                          <div className="rounded-xl border p-4">
                            <p className="text-sm font-medium">Source</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {draft.opportunity_sources?.name ||
                                "No linked source"}
                            </p>

                            {(draft.source_url || draft.application_url) && (
                              <a
                                href={draft.source_url || draft.application_url || "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 block truncate text-sm underline"
                              >
                                {draft.source_url || draft.application_url}
                              </a>
                            )}
                          </div>
                        </div>

                        {draft.competitiveness_factors &&
                          draft.competitiveness_factors.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {draft.competitiveness_factors.map((factor) => (
                                <Badge key={factor} variant="outline">
                                  {factor}
                                </Badge>
                              ))}
                            </div>
                          )}

                        <div className="mt-4 space-y-2">
                          <p className="text-sm font-medium">Review notes</p>
                          <Textarea
                            value={notes[draft.id] || ""}
                            onChange={(event) =>
                              setNotes((current) => ({
                                ...current,
                                [draft.id]: event.target.value,
                              }))
                            }
                            placeholder="Add notes before approving, rejecting, or marking duplicate."
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 lg:w-44 lg:flex-col">
                        {duplicateMatches[draft.id] && (
                          <div className="rounded-xl border bg-muted/40 p-3">
                            <p className="text-xs font-medium">
                              Duplicate found
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {duplicateMatches[draft.id].title}
                            </p>
                            <Button
                              type="button"
                              className="mt-3 w-full"
                              onClick={() =>
                                updateExistingOpportunityFromDraft(draft)
                              }
                            >
                              Update existing
                            </Button>
                          </div>
                        )}

                        <Button onClick={() => approveDraft(draft)}>
                          Approve
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() =>
                            updateDraftStatus(draft.id, "needs_review")
                          }
                        >
                          Needs review
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() =>
                            updateDraftStatus(draft.id, "duplicate")
                          }
                        >
                          Duplicate
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() =>
                            updateDraftStatus(draft.id, "rejected")
                          }
                        >
                          Reject
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() => deleteDraft(draft.id)}
                        >
                          Delete
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
