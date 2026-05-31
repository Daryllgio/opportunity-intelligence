function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALLOWED_CORE_TYPES = [
  "scholarship",
  "fellowship",
  "grant",
  "bursary",
  "award",
  "research program",
  "research opportunity",
  "leadership program",
  "competition",
  "career development program",
  "pipeline program",
];

const DISALLOWED_STANDALONE_TYPES = [
  "internship",
  "job",
  "part time job",
  "full time job",
  "volunteer",
  "course",
  "class",
  "bootcamp",
  "resource",
  "guide",
  "article",
  "event",
  "conference",
  "webinar",
  "workshop",
  "mentorship",
  "mentoring",
];

const DISALLOWED_TEXT_SIGNALS = [
  "career fair",
  "job board",
  "job posting",
  "apply for jobs",
  "student job",
  "volunteer opportunity",
  "newsletter",
  "resource guide",
  "list of scholarships",
  "scholarship directory",
  "previous winners",
  "award winners",
  "alumni highlights",
  "press release",
  "blog post",
];

const ALLOWED_TEXT_SIGNALS = [
  "scholarship",
  "fellowship",
  "grant",
  "bursary",
  "award",
  "research program",
  "undergraduate research",
  "summer research",
  "leadership program",
  "competition",
  "stipend",
  "tuition",
  "funding",
  "financial aid",
  "eligible applicants",
  "application deadline",
];

function hasAny(text: string, signals: string[]) {
  return signals.some((signal) => text.includes(signal));
}

export function shouldRejectExtractedOpportunity({
  type,
  title,
  url,
  description,
  ai_summary,
}: {
  type?: unknown;
  title?: unknown;
  url?: unknown;
  description?: unknown;
  ai_summary?: unknown;
}) {
  const normalizedType = normalize(type);
  const combined = normalize(`${title || ""} ${url || ""} ${description || ""} ${ai_summary || ""}`);

  const hasAllowedType = ALLOWED_CORE_TYPES.some(
    (allowed) =>
      normalizedType === allowed ||
      normalizedType.includes(allowed) ||
      allowed.includes(normalizedType)
  );

  const hasDisallowedStandaloneType = DISALLOWED_STANDALONE_TYPES.some(
    (blocked) =>
      normalizedType === blocked ||
      normalizedType.includes(blocked) ||
      blocked.includes(normalizedType)
  );

  const hasAllowedSignal = hasAny(combined, ALLOWED_TEXT_SIGNALS);
  const hasDisallowedSignal = hasAny(combined, DISALLOWED_TEXT_SIGNALS);

  const internshipWrappedInAllowedOpportunity =
    normalizedType.includes("internship") &&
    (
      combined.includes("scholarship") ||
      combined.includes("fellowship") ||
      combined.includes("grant") ||
      combined.includes("bursary") ||
      combined.includes("award") ||
      combined.includes("research program") ||
      combined.includes("leadership program")
    );

  if (internshipWrappedInAllowedOpportunity) {
    return { reject: false, reason: null };
  }

  if (hasDisallowedStandaloneType && !hasAllowedType) {
    return {
      reject: true,
      reason: `Outside target scope: standalone ${normalizedType || "non-target"} opportunity.`,
    };
  }

  if (!hasAllowedType && !hasAllowedSignal) {
    return {
      reject: true,
      reason: "Outside target scope: not a scholarship, fellowship, grant, award, research program, leadership program, or competition.",
    };
  }

  if (hasDisallowedSignal && !hasAllowedType) {
    return {
      reject: true,
      reason: "Outside target scope: page appears to be a guide, article, directory, event, job, or resource page.",
    };
  }

  return { reject: false, reason: null };
}

const STRONG_ALLOWED_PAGE_SIGNALS = [
  "scholarship",
  "fellowship",
  "grant",
  "bursary",
  "award",
  "research program",
  "research opportunity",
  "undergraduate research",
  "summer research",
  "leadership program",
  "competition",
];

const STANDALONE_INTERNSHIP_SIGNALS = [
  "internship",
  "internships",
  "internship program",
  "summer internship",
  "paid internship",
  "apply for internship",
];

const STRONG_DISALLOWED_PAGE_SIGNALS = [
  "job board",
  "job posting",
  "apply for jobs",
  "student jobs",
  "career fair",
  "volunteer opportunity",
  "course catalog",
  "class schedule",
  "webinar",
  "newsletter",
  "blog post",
  "press release",
  "alumni highlights",
  "previous winners",
  "award winners",
];

export function shouldRejectDiscoveredPageBeforeExtraction({
  opportunityType,
  title,
  url,
  text,
}: {
  opportunityType?: unknown;
  title?: unknown;
  url?: unknown;
  text?: unknown;
}) {
  const normalizedType = normalize(opportunityType);
  const combined = normalize(`${title || ""} ${url || ""} ${text || ""}`);

  const hasAllowedType = ALLOWED_CORE_TYPES.some(
    (allowed) =>
      normalizedType === allowed ||
      normalizedType.includes(allowed) ||
      allowed.includes(normalizedType)
  );

  const hasDisallowedStandaloneType = DISALLOWED_STANDALONE_TYPES.some(
    (blocked) =>
      normalizedType === blocked ||
      normalizedType.includes(blocked) ||
      blocked.includes(normalizedType)
  );

  const hasStrongAllowedSignal = hasAny(combined, STRONG_ALLOWED_PAGE_SIGNALS);
  const hasStandaloneInternshipSignal = hasAny(combined, STANDALONE_INTERNSHIP_SIGNALS);
  const hasStrongDisallowedSignal = hasAny(combined, STRONG_DISALLOWED_PAGE_SIGNALS);

  if (hasDisallowedStandaloneType && !hasAllowedType) {
    return {
      reject: true,
      reason: `Pre-extraction scope reject: standalone ${normalizedType || "non-target"} opportunity.`,
    };
  }

  if (hasStandaloneInternshipSignal && !hasStrongAllowedSignal && !hasAllowedType) {
    return {
      reject: true,
      reason: "Pre-extraction scope reject: standalone internship page is outside target scope.",
    };
  }

  if (hasStrongDisallowedSignal && !hasStrongAllowedSignal && !hasAllowedType) {
    return {
      reject: true,
      reason: "Pre-extraction scope reject: page appears to be a job, event, article, alumni, winner, or resource page.",
    };
  }

  return { reject: false, reason: null };
}

