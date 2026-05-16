"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { normalizeUrl } from "@/lib/utils/url-normalizer";
import { updateOpportunityWithLifecycle } from "@/lib/opportunities/update-opportunity";

type OpportunityForm = {
  title: string;
  provider: string;
  type: string;
  description: string;
  ai_summary: string;
  country: string;
  eligible_countries: string;
  eligible_education_levels: string;
  eligible_fields: string;
  funding_amount: string;
  funding_type: string;
  deadline: string;
  application_url: string;
  source_url: string;
  effort_level: string;
  reward_level: string;
  competitiveness_factors: string;
  is_active: boolean;
  is_approved: boolean;
};

const opportunityTypes = [
  "scholarship",
  "research",
  "funded_conference",
  "fellowship",
  "grant",
  "competition",
  "leadership_program",
  "professional_development",
];

const levels = ["Low", "Medium", "High"];

function listToString(value: string[] | null | undefined) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function EditOpportunityPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [form, setForm] = useState<OpportunityForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadOpportunity() {
      setLoading(true);

      const { data, error } = await supabase
        .from("opportunities")
        .select("*")
        .eq("id", params.id)
        .maybeSingle();

      if (error || !data) {
        setMessage(error?.message || "Opportunity not found.");
        setLoading(false);
        return;
      }

      setForm({
        title: data.title || "",
        provider: data.provider || "",
        type: data.type || "scholarship",
        description: data.description || "",
        ai_summary: data.ai_summary || "",
        country: data.country || "Global",
        eligible_countries: listToString(data.eligible_countries),
        eligible_education_levels: listToString(data.eligible_education_levels),
        eligible_fields: listToString(data.eligible_fields),
        funding_amount: data.funding_amount || "",
        funding_type: data.funding_type || "",
        deadline: data.deadline || "",
        application_url: data.application_url || "",
        source_url: data.source_url || "",
        effort_level: data.effort_level || "Medium",
        reward_level: data.reward_level || "Medium",
        competitiveness_factors: listToString(data.competitiveness_factors),
        is_active: Boolean(data.is_active),
        is_approved: Boolean(data.is_approved),
      });

      setLoading(false);
    }

    loadOpportunity();
  }, [params.id]);

  function updateField<K extends keyof OpportunityForm>(
    key: K,
    value: OpportunityForm[K]
  ) {
    setForm((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current
    );
  }

  async function saveOpportunity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form) return;

    setSaving(true);
    setMessage("");

    const finalUrl = form.source_url || form.application_url;
    const normalizedUrl = normalizeUrl(finalUrl);

    let error: Error | null = null;

    try {
      await updateOpportunityWithLifecycle({
        supabase,
        opportunityId: String(params.id),
        updates: {
          title: form.title.trim(),
          provider: form.provider.trim() || null,
          type: form.type,
          description: form.description.trim(),
          ai_summary: form.ai_summary.trim(),
          country: form.country.trim() || "Global",
          eligible_countries: splitList(form.eligible_countries),
          eligible_education_levels: splitList(form.eligible_education_levels),
          eligible_fields: splitList(form.eligible_fields),
          funding_amount: form.funding_amount.trim() || null,
          funding_type: form.funding_type.trim() || null,
          deadline: form.deadline || null,
          application_url: form.application_url.trim() || null,
          source_url: form.source_url.trim() || form.application_url.trim() || null,
          normalized_url: normalizedUrl || null,
          effort_level: form.effort_level,
          reward_level: form.reward_level,
          competitiveness_factors: splitList(form.competitiveness_factors),
          is_active: form.is_active,
          is_approved: form.is_approved,
        },
      });
    } catch (caughtError) {
      error =
        caughtError instanceof Error
          ? caughtError
          : new Error("Failed to update opportunity.");
    }

    setSaving(false);

    if (error) {
      if (
        error.message.includes("opportunities_normalized_url_unique") ||
        error.message.toLowerCase().includes("duplicate key")
      ) {
        setMessage("Another opportunity already uses this source/application URL.");
      } else {
        setMessage(error.message);
      }
      return;
    }

    setMessage("Opportunity updated successfully.");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background">
        <AppNav />
        <section className="px-6 py-8">
          <div className="mx-auto max-w-4xl">
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground">Loading opportunity...</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="min-h-screen bg-background">
        <AppNav />
        <section className="px-6 py-8">
          <div className="mx-auto max-w-4xl">
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground">
                  {message || "Opportunity not found."}
                </p>
                <Button asChild className="mt-4">
                  <Link href="/admin/opportunities">Back to opportunities</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <Badge variant="secondary">Admin · Edit Opportunity</Badge>

              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Edit live opportunity
              </h1>

              <p className="mt-3 max-w-3xl text-muted-foreground">
                Correct AI-extracted details before students rely on this opportunity.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/admin/opportunities">Back to manager</Link>
              </Button>

              <Button asChild variant="outline">
                <Link href={`/opportunities/${params.id}`}>View live</Link>
              </Button>
            </div>
          </div>

          <form onSubmit={saveOpportunity} className="mt-8 space-y-6">
            <Card>
              <CardContent className="grid gap-5 p-6 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Title</Label>
                  <Input
                    value={form.title}
                    onChange={(event) => updateField("title", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Input
                    value={form.provider}
                    onChange={(event) => updateField("provider", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Type</Label>
                  <select
                    value={form.type}
                    onChange={(event) => updateField("type", event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {opportunityTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Country / region</Label>
                  <Input
                    value={form.country}
                    onChange={(event) => updateField("country", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Deadline</Label>
                  <Input
                    type="date"
                    value={form.deadline || ""}
                    onChange={(event) => updateField("deadline", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Funding amount</Label>
                  <Input
                    value={form.funding_amount}
                    onChange={(event) =>
                      updateField("funding_amount", event.target.value)
                    }
                    placeholder="Up to $70,000"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Funding type</Label>
                  <Input
                    value={form.funding_type}
                    onChange={(event) =>
                      updateField("funding_type", event.target.value)
                    }
                    placeholder="Tuition, living expenses, stipend..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Effort level</Label>
                  <select
                    value={form.effort_level}
                    onChange={(event) =>
                      updateField("effort_level", event.target.value)
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {levels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Reward level</Label>
                  <select
                    value={form.reward_level}
                    onChange={(event) =>
                      updateField("reward_level", event.target.value)
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {levels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-5 p-6">
                <div className="space-y-2">
                  <Label>AI summary</Label>
                  <Textarea
                    value={form.ai_summary}
                    onChange={(event) =>
                      updateField("ai_summary", event.target.value)
                    }
                    className="min-h-24"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Full description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(event) =>
                      updateField("description", event.target.value)
                    }
                    className="min-h-40"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="grid gap-5 p-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Eligible countries</Label>
                  <Input
                    value={form.eligible_countries}
                    onChange={(event) =>
                      updateField("eligible_countries", event.target.value)
                    }
                    placeholder="Canada, United States"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Education levels</Label>
                  <Input
                    value={form.eligible_education_levels}
                    onChange={(event) =>
                      updateField("eligible_education_levels", event.target.value)
                    }
                    placeholder="High School, Undergraduate"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Eligible fields</Label>
                  <Input
                    value={form.eligible_fields}
                    onChange={(event) =>
                      updateField("eligible_fields", event.target.value)
                    }
                    placeholder="Any, STEM, Business"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Competitiveness factors</Label>
                  <Input
                    value={form.competitiveness_factors}
                    onChange={(event) =>
                      updateField("competitiveness_factors", event.target.value)
                    }
                    placeholder="Leadership, community impact, academic record"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="grid gap-5 p-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Application URL</Label>
                  <Input
                    value={form.application_url}
                    onChange={(event) =>
                      updateField("application_url", event.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Source URL</Label>
                  <Input
                    value={form.source_url}
                    onChange={(event) => updateField("source_url", event.target.value)}
                  />
                </div>

                <label className="flex items-center gap-3 rounded-xl border p-4">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) =>
                      updateField("is_active", event.target.checked)
                    }
                  />
                  <span>
                    <span className="block font-medium">Active</span>
                    <span className="block text-sm text-muted-foreground">
                      Show this opportunity to students.
                    </span>
                  </span>
                </label>

                <label className="flex items-center gap-3 rounded-xl border p-4">
                  <input
                    type="checkbox"
                    checked={form.is_approved}
                    onChange={(event) =>
                      updateField("is_approved", event.target.checked)
                    }
                  />
                  <span>
                    <span className="block font-medium">Approved</span>
                    <span className="block text-sm text-muted-foreground">
                      Mark this opportunity as approved for publishing.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>

            {message && (
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{message}</p>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/admin/opportunities")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
