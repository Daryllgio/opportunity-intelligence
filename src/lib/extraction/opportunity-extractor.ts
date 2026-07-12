type ExtractedOpportunityDraft = {
  title: string;
  provider: string;
  type: string;
  description: string;
  ai_summary: string;
  country: string;
  eligible_countries: string[];
  eligible_education_levels: string[];
  eligible_fields: string[];
  funding_amount: string;
  funding_type: string;
  deadline: string | null;
  application_url: string;
  effort_level: string;
  reward_level: string;
  competitiveness_factors: string[];
  extraction_confidence: "low" | "medium" | "high";
};

function findDeadline(text: string) {
  const isoDate = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);

  if (isoDate) {
    const [year, month, day] = isoDate[0].split(/[-/]/);
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const monthDate = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+([0-9]{1,2}),?\s+(20\d{2})\b/i
  );

  if (monthDate) {
    const months: Record<string, string> = {
      january: "01",
      february: "02",
      march: "03",
      april: "04",
      may: "05",
      june: "06",
      july: "07",
      august: "08",
      september: "09",
      october: "10",
      november: "11",
      december: "12",
    };

    const month = months[monthDate[1].toLowerCase()];
    const day = monthDate[2].padStart(2, "0");
    const year = monthDate[3];

    return `${year}-${month}-${day}`;
  }

  return null;
}

function detectType(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("research")) return "research_program";
  if (lower.includes("fellowship")) return "fellowship";
  if (lower.includes("grant")) return "grant";
  if (lower.includes("competition") || lower.includes("challenge")) return "competition";
  if (lower.includes("leadership")) return "leadership_program";
  if (lower.includes("pipeline") || lower.includes("pathway")) return "career_development_program";
  if (lower.includes("career development") || lower.includes("professional development")) {
    return "career_development_program";
  }

  return "scholarship";
}

function detectEducationLevels(text: string) {
  const lower = text.toLowerCase();
  const levels: string[] = [];

  if (lower.includes("high school")) levels.push("High School");
  if (lower.includes("undergraduate") || lower.includes("bachelor")) levels.push("Undergraduate");
  if (lower.includes("graduate") || lower.includes("master")) levels.push("Graduate");
  if (lower.includes("phd") || lower.includes("doctoral")) levels.push("PhD");

  return levels.length > 0 ? levels : ["Any"];
}

function detectFields(text: string) {
  const lower = text.toLowerCase();
  const fields: string[] = [];

  if (lower.includes("stem")) fields.push("STEM");
  if (lower.includes("computer science") || lower.includes("technology") || lower.includes("data")) {
    fields.push("Computer Science");
  }
  if (lower.includes("health") || lower.includes("medicine") || lower.includes("public health")) {
    fields.push("Health Sciences");
  }
  if (lower.includes("engineering")) fields.push("Engineering");
  if (lower.includes("business") || lower.includes("entrepreneur")) fields.push("Business");
  if (lower.includes("policy") || lower.includes("international relations")) {
    fields.push("Public Policy");
  }

  return fields.length > 0 ? Array.from(new Set(fields)) : ["Any"];
}

function detectCompetitivenessFactors(text: string) {
  const lower = text.toLowerCase();
  const factors: string[] = [];

  if (lower.includes("academic") || lower.includes("gpa") || lower.includes("transcript")) {
    factors.push("Academic excellence");
  }

  if (lower.includes("research") || lower.includes("lab") || lower.includes("publication")) {
    factors.push("Research potential");
  }

  if (lower.includes("leadership") || lower.includes("leader")) {
    factors.push("Leadership");
  }

  if (lower.includes("community") || lower.includes("volunteer") || lower.includes("service")) {
    factors.push("Community impact");
  }

  if (lower.includes("project") || lower.includes("startup") || lower.includes("innovation")) {
    factors.push("Project ownership");
  }

  if (lower.includes("essay") || lower.includes("statement")) {
    factors.push("Application writing strength");
  }

  return factors.length > 0 ? Array.from(new Set(factors)) : ["General profile strength"];
}

function detectFunding(text: string) {
  const money = text.match(/\$[0-9,]+(\.\d{2})?/);

  if (money) return money[0];

  if (/fully funded/i.test(text)) return "Fully funded";
  if (/travel funding/i.test(text)) return "Travel funding";
  if (/stipend/i.test(text)) return "Stipend";
  if (/tuition/i.test(text)) return "Tuition support";

  return "";
}

function detectRewardLevel(text: string) {
  const lower = text.toLowerCase();

  if (
    lower.includes("fully funded") ||
    lower.includes("$10,000") ||
    lower.includes("$20,000") ||
    lower.includes("international")
  ) {
    return "High";
  }

  if (lower.includes("certificate") || lower.includes("small grant")) return "Low";

  return "Medium";
}

function detectEffortLevel(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("essay") || lower.includes("recommendation") || lower.includes("interview")) {
    return "High";
  }

  if (lower.includes("short form") || lower.includes("nomination")) return "Low";

  return "Medium";
}

function generateTitle(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const likelyTitle = lines.find((line) => line.length >= 8 && line.length <= 90);

  return likelyTitle || "Extracted Opportunity Draft";
}

function generateSummary(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();

  if (clean.length <= 220) return clean;

  return `${clean.slice(0, 220)}...`;
}

export function extractOpportunityDraft({
  rawText,
  sourceUrl,
}: {
  rawText: string;
  sourceUrl?: string;
}): ExtractedOpportunityDraft {
  const cleanText = rawText.trim();

  const type = detectType(cleanText);
  const deadline = findDeadline(cleanText);
  const fundingAmount = detectFunding(cleanText);
  const factors = detectCompetitivenessFactors(cleanText);
  const educationLevels = detectEducationLevels(cleanText);
  const fields = detectFields(cleanText);

  const confidence =
    cleanText.length > 900 && deadline && factors.length >= 2
      ? "high"
      : cleanText.length > 300
        ? "medium"
        : "low";

  return {
    title: generateTitle(cleanText),
    provider: "",
    type,
    description: cleanText,
    ai_summary: generateSummary(cleanText),
    country: "Global",
    eligible_countries: ["Any"],
    eligible_education_levels: educationLevels,
    eligible_fields: fields,
    funding_amount: fundingAmount,
    funding_type: type === "research_program" ? "Research funding" : "",
    deadline,
    application_url: sourceUrl || "",
    effort_level: detectEffortLevel(cleanText),
    reward_level: detectRewardLevel(cleanText),
    competitiveness_factors: factors,
    extraction_confidence: confidence,
  };
}
