"use client";

import { useState } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";

const opportunityTypes = [
  { label: "Scholarship", value: "scholarship" },
  { label: "Research", value: "research" },
  { label: "Funded Conference", value: "funded_conference" },
  { label: "Fellowship", value: "fellowship" },
  { label: "Grant", value: "grant" },
  { label: "Competition", value: "competition" },
  { label: "Leadership Program", value: "leadership_program" },
  { label: "Professional Development", value: "professional_development" },
];

type FormState = {
  title: string;
  provider: string;
  type: string;
  description: string;
  country: string;
  eligible_countries: string;
  eligible_education_levels: string;
  eligible_fields: string;
  funding_amount: string;
  funding_type: string;
  deadline: string;
  application_url: string;
  effort_level: string;
  reward_level: string;
  competitiveness_factors: string;
  source_url: string;
};

const initialState: FormState = {
  title: "",
  provider: "",
  type: "scholarship",
  description: "",
  country: "",
  eligible_countries: "Any",
  eligible_education_levels: "Undergraduate, Graduate",
  eligible_fields: "Any",
  funding_amount: "",
  funding_type: "",
  deadline: "",
  application_url: "",
  effort_level: "Medium",
  reward_level: "Medium",
  competitiveness_factors: "",
  source_url: "",
};

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminPage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (!form.title.trim()) {
      setMessage("Opportunity title is required.");
      setLoading(false);
      return;
    }

    if (!form.description.trim()) {
      setMessage("Description is required because scoring depends on it.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("opportunities").insert({
      title: form.title,
      provider: form.provider || null,
      type: form.type,
      description: form.description,
      country: form.country || "Global",
      eligible_countries: splitList(form.eligible_countries),
      eligible_education_levels: splitList(form.eligible_education_levels),
      eligible_fields: splitList(form.eligible_fields),
      funding_amount: form.funding_amount || null,
      funding_type: form.funding_type || null,
      deadline: form.deadline || null,
      application_url: form.application_url || null,
      effort_level: form.effort_level || null,
      reward_level: form.reward_level || null,
      competitiveness_factors: splitList(form.competitiveness_factors),
      source_url: form.source_url || form.application_url || null,
      is_active: true,
      is_approved: true,
      updated_at: new Date().toISOString(),
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Opportunity added and approved successfully.");
    setForm(initialState);
  }

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <Badge variant="secondary">Admin</Badge>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Opportunity intake
          </h1>

          <p className="mt-3 max-w-3xl text-muted-foreground">
            Add test opportunities while we build the AI harvester. Later, this
            page becomes the review queue for opportunities extracted by AI.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.42fr]">
            <Card>
              <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Opportunity title</Label>
                      <Input
                        value={form.title}
                        onChange={(event) =>
                          updateField("title", event.target.value)
                        }
                        placeholder="Example: Global Research Fellowship"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Provider</Label>
                      <Input
                        value={form.provider}
                        onChange={(event) =>
                          updateField("provider", event.target.value)
                        }
                        placeholder="Organization, school, foundation..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Opportunity type</Label>
                      <select
                        value={form.type}
                        onChange={(event) =>
                          updateField("type", event.target.value)
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {opportunityTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label>Country / location</Label>
                      <Input
                        value={form.country}
                        onChange={(event) =>
                          updateField("country", event.target.value)
                        }
                        placeholder="Global, Canada, United States..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Deadline</Label>
                      <Input
                        type="date"
                        value={form.deadline}
                        onChange={(event) =>
                          updateField("deadline", event.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Funding amount</Label>
                      <Input
                        value={form.funding_amount}
                        onChange={(event) =>
                          updateField("funding_amount", event.target.value)
                        }
                        placeholder="Example: Up to $5,000"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Funding type</Label>
                      <Input
                        value={form.funding_type}
                        onChange={(event) =>
                          updateField("funding_type", event.target.value)
                        }
                        placeholder="Scholarship, travel funding, grant..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Application URL</Label>
                      <Input
                        value={form.application_url}
                        onChange={(event) =>
                          updateField("application_url", event.target.value)
                        }
                        placeholder="https://..."
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
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
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
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={form.description}
                      onChange={(event) =>
                        updateField("description", event.target.value)
                      }
                      placeholder="Paste the opportunity description. The scoring engine uses this to understand what the opportunity values."
                      className="min-h-32"
                      required
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Eligible countries</Label>
                      <Input
                        value={form.eligible_countries}
                        onChange={(event) =>
                          updateField("eligible_countries", event.target.value)
                        }
                        placeholder="Separate with commas. Example: Any, Canada"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Eligible education levels</Label>
                      <Input
                        value={form.eligible_education_levels}
                        onChange={(event) =>
                          updateField(
                            "eligible_education_levels",
                            event.target.value
                          )
                        }
                        placeholder="Undergraduate, Graduate"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Eligible fields</Label>
                      <Input
                        value={form.eligible_fields}
                        onChange={(event) =>
                          updateField("eligible_fields", event.target.value)
                        }
                        placeholder="Any, STEM, Health Sciences..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Source URL</Label>
                      <Input
                        value={form.source_url}
                        onChange={(event) =>
                          updateField("source_url", event.target.value)
                        }
                        placeholder="Original source URL"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Competitiveness factors</Label>
                    <Textarea
                      value={form.competitiveness_factors}
                      onChange={(event) =>
                        updateField(
                          "competitiveness_factors",
                          event.target.value
                        )
                      }
                      placeholder="Separate with commas. Example: Research experience, leadership, community impact, academic excellence"
                    />
                  </div>

                  {message && (
                    <p className="text-sm text-muted-foreground">{message}</p>
                  )}

                  <Button type="submit" disabled={loading}>
                    {loading ? "Adding opportunity..." : "Add opportunity"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold">Future AI workflow</h2>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <p>1. AI finds opportunity sources.</p>
                    <p>2. AI extracts structured fields.</p>
                    <p>3. Admin reviews and approves.</p>
                    <p>4. Students receive ranked matches.</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold">Why this page exists</h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    This page is for testing and review. It is not the long-term
                    daily workflow. Later, it will become the approval queue for
                    AI-extracted opportunities.
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
