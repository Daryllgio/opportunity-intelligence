import { createHash } from "crypto";

type ExperienceSummaryRow = {
  section_key: string;
  experience_key: string;
  raw_content_hash?: string | null;
  summary?: string | null;
  evidence_tags?: string[] | null;
  notable_metrics?: string[] | null;
};

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableNormalize(record[key]);
        return acc;
      }, {});
  }

  if (typeof value === "string") {
    return value.replace(/\s+/g, " ").trim();
  }

  return value ?? null;
}

function hashObject(value: unknown) {
  const normalized = stableNormalize(value);

  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

export function buildProfileScoringFingerprint({
  profile,
  experienceSummaries,
}: {
  profile: Record<string, unknown>;
  experienceSummaries: ExperienceSummaryRow[];
}) {
  const sortedExperienceSummaries = [...experienceSummaries].sort((a, b) => {
    const left = `${a.section_key}:${a.experience_key}`;
    const right = `${b.section_key}:${b.experience_key}`;
    return left.localeCompare(right);
  });

  return {
    basic_profile: {
      education_level: profile.education_level,
      student_status: profile.student_status,
      opportunity_level: profile.opportunity_level,
      field_of_study: profile.field_of_study,
      field_of_study_other: profile.field_of_study_other,
      country_of_study: profile.country_of_study,
      nationality: profile.nationality,
      gpa: profile.gpa,
      target_opportunity_types: profile.target_opportunity_types,
      preferred_regions: profile.preferred_regions,
      financial_need: profile.financial_need,
    },
    experience_summary_versions: sortedExperienceSummaries.map((item) => ({
      section_key: item.section_key,
      experience_key: item.experience_key,
      raw_content_hash: item.raw_content_hash || null,
      summary: item.summary || null,
      evidence_tags: item.evidence_tags || [],
      notable_metrics: item.notable_metrics || [],
    })),
  };
}

export function buildProfileScoringHash({
  profile,
  experienceSummaries,
}: {
  profile: Record<string, unknown>;
  experienceSummaries: ExperienceSummaryRow[];
}) {
  return hashObject(
    buildProfileScoringFingerprint({
      profile,
      experienceSummaries,
    })
  );
}

export function buildOpportunityContentFingerprint(
  opportunity: Record<string, unknown>
) {
  return {
    title: opportunity.title,
    provider: opportunity.provider,
    type: opportunity.type,
    description: opportunity.description,
    ai_summary: opportunity.ai_summary,
    country: opportunity.country,
    eligible_countries: opportunity.eligible_countries,
    eligible_education_levels: opportunity.eligible_education_levels,
    eligible_fields: opportunity.eligible_fields,
    funding_amount: opportunity.funding_amount,
    funding_type: opportunity.funding_type,
    deadline: opportunity.deadline,
    effort_level: opportunity.effort_level,
    reward_level: opportunity.reward_level,
    competitiveness_factors: opportunity.competitiveness_factors,
    application_url: opportunity.application_url,
  };
}

export function buildOpportunityContentHash(
  opportunity: Record<string, unknown>
) {
  return hashObject(buildOpportunityContentFingerprint(opportunity));
}
