import { createHash } from "crypto";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const EXPERIENCE_SECTIONS = [
  {
    sectionKey: "leadership",
    profileField: "leadership_experiences",
    label: "Leadership experiences",
  },
  {
    sectionKey: "research",
    profileField: "research_experiences",
    label: "Research experiences",
  },
  {
    sectionKey: "volunteering",
    profileField: "volunteer_experiences",
    label: "Volunteer/community experiences",
  },
  {
    sectionKey: "work_projects",
    profileField: "work_project_experiences",
    label: "Work/project experiences",
  },
  {
    sectionKey: "awards",
    profileField: "awards",
    label: "Awards and recognition",
  },
] as const;

type ExperienceSectionKey =
  | "leadership"
  | "research"
  | "volunteering"
  | "work_projects"
  | "awards";

type NormalizedExperience = {
  section_key: ExperienceSectionKey;
  experience_key: string;
  experience_title: string | null;
  organization: string | null;
  start_date: string | null;
  end_date: string | null;
  raw_content_text: string;
  raw_content_hash: string;
  raw_content_length: number;
};

function createSupabaseForRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    }
  );
}

function cleanJsonResponse(text: string) {
  return text
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseExperienceArray(value: unknown): unknown[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      // Not JSON. Treat as one experience block.
    }

    return [trimmed];
  }

  return [value];
}

function getExperienceTitle(item: unknown, fallback: string) {
  if (typeof item === "object" && item !== null) {
    const record = item as Record<string, unknown>;

    return (
      safeString(record.role) ||
      safeString(record.title) ||
      safeString(record.position) ||
      safeString(record.name) ||
      fallback
    );
  }

  const text = safeString(item);
  const firstLine = text.split("\n").find(Boolean);

  return firstLine ? firstLine.slice(0, 120) : fallback;
}

function getOrganization(item: unknown) {
  if (typeof item === "object" && item !== null) {
    const record = item as Record<string, unknown>;

    return (
      safeString(record.organization) ||
      safeString(record.company) ||
      safeString(record.institution) ||
      safeString(record.school) ||
      null
    );
  }

  return null;
}

function getStartDate(item: unknown) {
  if (typeof item === "object" && item !== null) {
    const record = item as Record<string, unknown>;

    return (
      safeString(record.start_date) ||
      safeString(record.startDate) ||
      safeString(record.start) ||
      null
    );
  }

  return null;
}

function getEndDate(item: unknown) {
  if (typeof item === "object" && item !== null) {
    const record = item as Record<string, unknown>;

    return (
      safeString(record.end_date) ||
      safeString(record.endDate) ||
      safeString(record.end) ||
      null
    );
  }

  return null;
}

function stringifyExperience(item: unknown) {
  if (typeof item === "string") {
    return normalizeWhitespace(item);
  }

  if (typeof item === "object" && item !== null) {
    const record = item as Record<string, unknown>;

    const parts = [
      safeString(record.role) ||
        safeString(record.title) ||
        safeString(record.position) ||
        safeString(record.name),
      safeString(record.organization) ||
        safeString(record.company) ||
        safeString(record.institution) ||
        safeString(record.school),
      safeString(record.start_date) ||
        safeString(record.startDate) ||
        safeString(record.start),
      safeString(record.end_date) ||
        safeString(record.endDate) ||
        safeString(record.end),
      safeString(record.description),
      safeString(record.details),
      safeString(record.summary),
    ].filter(Boolean);

    if (parts.length > 0) {
      return normalizeWhitespace(parts.join(" | "));
    }

    return normalizeWhitespace(JSON.stringify(item));
  }

  return normalizeWhitespace(String(item || ""));
}

function buildExperienceKey(
  sectionKey: ExperienceSectionKey,
  item: unknown,
  index: number,
  rawContentText: string
) {
  if (typeof item === "object" && item !== null) {
    const record = item as Record<string, unknown>;

    const existingId =
      safeString(record.id) ||
      safeString(record.experience_id) ||
      safeString(record.experienceId);

    if (existingId) {
      return existingId;
    }

    const title = getExperienceTitle(item, "");
    const organization = getOrganization(item) || "";
    const startDate = getStartDate(item) || "";
    const endDate = getEndDate(item) || "";

    const stableParts = [title, organization, startDate, endDate]
      .map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
      .filter(Boolean)
      .join("-");

    if (stableParts) {
      return stableParts.slice(0, 160);
    }
  }

  // Fallback for plain text entries. This is not perfect if users reorder items,
  // but it works until experience items have stable IDs in the profile editor.
  return `${sectionKey}_${index}_${hashText(rawContentText).slice(0, 10)}`;
}

function extractExperiences(profile: Record<string, unknown>) {
  const experiences: NormalizedExperience[] = [];

  for (const section of EXPERIENCE_SECTIONS) {
    const rawItems = parseExperienceArray(profile[section.profileField]);

    rawItems.forEach((item, index) => {
      const rawContentText = stringifyExperience(item);

      if (!rawContentText) return;

      const experienceTitle = getExperienceTitle(
        item,
        `${section.label} ${index + 1}`
      );
      const organization = getOrganization(item);
      const startDate = getStartDate(item);
      const endDate = getEndDate(item);
      const rawContentHash = hashText(rawContentText);

      experiences.push({
        section_key: section.sectionKey,
        experience_key: buildExperienceKey(
          section.sectionKey,
          item,
          index,
          rawContentText
        ),
        experience_title: experienceTitle,
        organization,
        start_date: startDate,
        end_date: endDate,
        raw_content_text: rawContentText,
        raw_content_hash: rawContentHash,
        raw_content_length: rawContentText.length,
      });
    });
  }

  return experiences;
}

function getMeaningfulChangeReason(
  existingText: string | null | undefined,
  newText: string
) {
  if (!existingText) return "new_experience";

  const oldNormalized = normalizeWhitespace(existingText.toLowerCase());
  const newNormalized = normalizeWhitespace(newText.toLowerCase());

  if (oldNormalized === newNormalized) return null;

  const oldLength = oldNormalized.length;
  const newLength = newNormalized.length;

  const lengthChangeRatio =
    oldLength === 0 ? 1 : Math.abs(newLength - oldLength) / oldLength;

  const oldNumbers = oldNormalized.match(/\d+[\d,.%+/-]*/g) || [];
  const newNumbers = newNormalized.match(/\d+[\d,.%+/-]*/g) || [];

  const oldNumberSet = new Set(oldNumbers);
  const newNumberSet = new Set(newNumbers);

  const hasNewNumber = [...newNumberSet].some((num) => !oldNumberSet.has(num));

  if (hasNewNumber) return "new_metric_added";
  if (lengthChangeRatio >= 0.15) return "meaningful_length_change";

  // If only a very small number of words changed, skip summarization.
  const oldWords = oldNormalized.split(" ").filter(Boolean);
  const newWords = newNormalized.split(" ").filter(Boolean);

  const oldWordSet = new Set(oldWords);
  const newWordSet = new Set(newWords);

  const changedWords = [
    ...newWords.filter((word) => !oldWordSet.has(word)),
    ...oldWords.filter((word) => !newWordSet.has(word)),
  ];

  if (changedWords.length <= 5) return null;

  return "meaningful_text_change";
}

function groupBySection(experiences: NormalizedExperience[]) {
  const grouped: Record<string, NormalizedExperience[]> = {};

  for (const experience of experiences) {
    if (!grouped[experience.section_key]) {
      grouped[experience.section_key] = [];
    }

    grouped[experience.section_key].push(experience);
  }

  return grouped;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY." },
        { status: 500 }
      );
    }

    const supabase = createSupabaseForRequest(request);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to summarize profile experiences." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Complete your profile before summarizing experiences." },
        { status: 400 }
      );
    }

    const experiences = extractExperiences(profile as Record<string, unknown>);

    if (experiences.length === 0) {
      return NextResponse.json({
        summarized: [],
        skipped: [],
        message: "No experience entries found to summarize.",
      });
    }

    const { data: existingSummaries, error: existingError } = await supabase
      .from("profile_experience_summaries")
      .select(
        "id, section_key, experience_key, raw_content_hash, raw_content_text"
      )
      .eq("user_id", user.id);

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const existingMap = new Map<string, {
      id: string;
      raw_content_hash: string;
      raw_content_text: string | null;
    }>();

    (existingSummaries || []).forEach((summary) => {
      existingMap.set(`${summary.section_key}:${summary.experience_key}`, {
        id: summary.id,
        raw_content_hash: summary.raw_content_hash,
        raw_content_text: summary.raw_content_text,
      });
    });

    const toSummarize: (NormalizedExperience & { change_reason: string })[] = [];
    const skipped: { section_key: string; experience_key: string; reason: string }[] = [];

    for (const experience of experiences) {
      const key = `${experience.section_key}:${experience.experience_key}`;
      const existing = existingMap.get(key);

      if (!existing) {
        toSummarize.push({ ...experience, change_reason: "new_experience" });
        continue;
      }

      if (existing.raw_content_hash === experience.raw_content_hash) {
        skipped.push({
          section_key: experience.section_key,
          experience_key: experience.experience_key,
          reason: "unchanged",
        });
        continue;
      }

      const changeReason = getMeaningfulChangeReason(
        existing.raw_content_text,
        experience.raw_content_text
      );

      if (!changeReason) {
        skipped.push({
          section_key: experience.section_key,
          experience_key: experience.experience_key,
          reason: "minor_change_kept_existing_summary",
        });
        continue;
      }

      toSummarize.push({ ...experience, change_reason: changeReason });
    }

    if (toSummarize.length === 0) {
      return NextResponse.json({
        summarized: [],
        skipped,
        message: "No new or meaningfully changed experiences to summarize.",
      });
    }

    const grouped = groupBySection(toSummarize);

    const prompt = `
You are OppScore's profile experience summarization engine.

Summarize each individual student experience for later competitiveness scoring.

Return JSON only. No markdown. No commentary.

Rules:
- Create one summary for each experience provided.
- Do not merge experiences together.
- Do not invent facts.
- Preserve concrete metrics, numbers, tools, responsibilities, and outcomes.
- Keep each summary at or below 700 characters.
- Focus on evidence relevant to scholarships, research programs, fellowships, competitions, and leadership programs.
- notable_metrics should include only real metrics/numbers found in the experience.
- evidence_tags should be concise tags that describe the evidence.

Return this exact JSON shape:
{
  "summaries": [
    {
      "section_key": "leadership" | "research" | "volunteering" | "work_projects" | "awards",
      "experience_key": "string",
      "summary": "string, max 700 characters",
      "evidence_tags": ["string"],
      "notable_metrics": ["string"]
    }
  ]
}

Experiences grouped by section:
${JSON.stringify(grouped, null, 2)}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        temperature: 0,
        topP: 0.8,
        topK: 20,
      },
    });

    const responseText = response.text;

    if (!responseText) {
      return NextResponse.json(
        { error: "Gemini did not return readable text." },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(cleanJsonResponse(responseText));
    const summaries = Array.isArray(parsed.summaries) ? parsed.summaries : [];

    const experienceMap = new Map<string, NormalizedExperience>();

    for (const experience of toSummarize) {
      experienceMap.set(
        `${experience.section_key}:${experience.experience_key}`,
        experience
      );
    }

    const rows = summaries
      .map((summary) => {
        const sectionKey = String(summary.section_key || "");
        const experienceKey = String(summary.experience_key || "");
        const original = experienceMap.get(`${sectionKey}:${experienceKey}`);

        if (!original) return null;

        return {
          user_id: user.id,
          section_key: original.section_key,
          experience_key: original.experience_key,
          experience_title: original.experience_title,
          organization: original.organization,
          start_date: original.start_date,
          end_date: original.end_date,
          raw_content_hash: original.raw_content_hash,
          raw_content_length: original.raw_content_length,
          raw_content_text: original.raw_content_text,
          summary: String(summary.summary || "").slice(0, 900),
          evidence_tags: Array.isArray(summary.evidence_tags)
            ? summary.evidence_tags.map(String).slice(0, 10)
            : [],
          notable_metrics: Array.isArray(summary.notable_metrics)
            ? summary.notable_metrics.map(String).slice(0, 8)
            : [],
          model_used: "gemini-2.5-pro",
          last_summarized_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Gemini did not return valid experience summaries." },
        { status: 500 }
      );
    }

    const { data: savedRows, error: saveError } = await supabase
      .from("profile_experience_summaries")
      .upsert(rows, {
        onConflict: "user_id,section_key,experience_key",
      })
      .select("*");

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json({
      summarized: savedRows,
      skipped,
      counts: {
        totalExperiences: experiences.length,
        summarized: savedRows?.length || 0,
        skipped: skipped.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Experience summarization failed.",
      },
      { status: 500 }
    );
  }
}
