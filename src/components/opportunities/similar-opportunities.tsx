"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { OpportunityCard } from "@/components/ui/opportunity-card";

type SimilarOpportunity = {
  id: string;
  title: string;
  provider: string | null;
  type: string;
  deadline: string | null;
  application_status: string | null;
  funding_amount: string | null;
  country: string | null;
  created_at: string | null;
  eligible_fields: string[] | null;
};

/**
 * "You might also like": same type first, then overlapping fields. Fetched
 * client-side after the main detail renders so it never blocks the page.
 */
export function SimilarOpportunities({
  opportunityId,
  type,
  eligibleFields,
}: {
  opportunityId: string;
  type: string;
  eligibleFields: string[] | null;
}) {
  const [similar, setSimilar] = useState<SimilarOpportunity[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data } = await supabase
        .from("opportunities")
        .select(
          "id, title, provider, type, deadline, application_status, funding_amount, country, created_at, eligible_fields"
        )
        .eq("is_active", true)
        .eq("is_approved", true)
        .eq("lifecycle_status", "active")
        .eq("type", type)
        .neq("id", opportunityId)
        .order("deadline", { ascending: true, nullsFirst: false })
        .limit(12);

      if (!active || !data) return;

      const fields = (eligibleFields || []).map((f) => f.toLowerCase());
      const scored = data
        .map((row) => {
          const rowFields = (row.eligible_fields || []).map((f: string) =>
            f.toLowerCase()
          );
          const overlap = fields.filter((f) =>
            rowFields.some((rf: string) => rf.includes(f) || f.includes(rf))
          ).length;
          return { row, overlap };
        })
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, 4)
        .map((item) => item.row as SimilarOpportunity);

      setSimilar(scored);
    }

    load();
    return () => {
      active = false;
    };
  }, [opportunityId, type, eligibleFields]);

  if (similar.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold">You might also like</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {similar.map((opportunity) => (
          <OpportunityCard
            key={opportunity.id}
            id={opportunity.id}
            title={opportunity.title}
            provider={opportunity.provider}
            type={opportunity.type}
            deadline={opportunity.deadline}
            applicationStatus={opportunity.application_status}
            fundingAmount={opportunity.funding_amount}
            country={opportunity.country}
            createdAt={opportunity.created_at}
          />
        ))}
      </div>
    </section>
  );
}
