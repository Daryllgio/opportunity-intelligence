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

// ---------------------------------------------------------------------------
// Degree-program / admissions detection.
//
// We list opportunities students apply to ON TOP of their education —
// scholarships, fellowships, research programs. We never list the education
// itself: degree admissions (BA/MD/JD/MBA/PhD enrollment), course
// registration, or general university applications.
//
// Funding words in the record's own title override degree signals, because
// "Admission Bursary" and "Entrance Scholarship" are real opportunities that
// legitimately live on admissions pages.
// ---------------------------------------------------------------------------

const FUNDING_TITLE_SIGNALS = [
  "scholarship",
  "scholars",
  "fellowship",
  "fellows",
  "bursary",
  "grant",
  "award",
  "stipend",
  "prize",
  "fund",
  "competition",
  "contest",
  "challenge",
];

const DEGREE_TITLE_PATTERNS: RegExp[] = [
  /\b(ba|bs|bsc|bfa|bba|beng|md|jd|mba|llb|ma|ms|msc|meng|mfa|phd|dds|dvm|pharmd)\b.{0,4}\b(in|at|program|degree)\b/,
  /\b(bachelor|master|doctor)s? (of|degree)\b/,
  /\bjuris doctor\b/,
  /\b(honors|honours) (program|college|degree)\b/,
  /\b(md|jd|mba|phd|dds|dvm) program\b/,
  /\bdegree program\b/,
  /\b(undergraduate|graduate|freshman|transfer) (admission|admissions|application to)\b/,
  /\bprogram admission\b/,
  /\badmission requirements\b/,
];

const DEGREE_TEXT_SIGNALS = [
  "freshman application",
  "transfer application",
  "undergraduate admissions",
  "graduate admissions",
  "admission requirements",
  "apply for admission",
  "application for admission",
  "common app",
  "coalition application",
  "course registration",
  "register in courses",
  "register for classes",
  "enroll in classes",
  "add or drop courses",
  "amcas",
  "aadsas",
  "lsac",
  "ouac",
  "degree requirements",
  "declare a major",
];

/**
 * True when the record IS a degree program / admissions / course-registration
 * page rather than an opportunity layered on top of one.
 */
export function looksLikeDegreeProgramRecord({
  title,
  text,
}: {
  title?: unknown;
  text?: unknown;
}): { isDegree: boolean; reason: string | null } {
  const normalizedTitle = normalize(title);
  const combined = normalize(`${title || ""} ${text || ""}`);

  // Funding-named records are opportunities even when they live on
  // admissions pages ("Entrance Scholarship", "Admission Bursary").
  if (hasAny(normalizedTitle, FUNDING_TITLE_SIGNALS)) {
    return { isDegree: false, reason: null };
  }

  const titlePattern = DEGREE_TITLE_PATTERNS.find((pattern) =>
    pattern.test(normalizedTitle)
  );
  if (titlePattern) {
    return {
      isDegree: true,
      reason: `Title reads as a degree/admissions record ("${normalizedTitle.slice(0, 70)}").`,
    };
  }

  const textHits = DEGREE_TEXT_SIGNALS.filter((signal) =>
    combined.includes(signal)
  );
  if (textHits.length >= 2) {
    return {
      isDegree: true,
      reason: `Content is dominated by degree/admissions signals (${textHits.slice(0, 3).join(", ")}).`,
    };
  }

  return { isDegree: false, reason: null };
}

/**
 * Institution-facing funding detector. Federal/foundation grants whose
 * APPLICANT is a school, university, state agency, or organization are not
 * student opportunities — the student never applies to them (NPD and SDS
 * both slipped through: the money eventually reaches students, but only
 * institutions can apply). Recognized by who the page says may apply and by
 * the application infrastructure (the grants.gov ecosystem).
 */
const INSTITUTION_APPLICANT_SIGNALS = [
  "eligible applicants are institutions",
  "institutions of higher education may apply",
  "applications from institutions of higher education",
  "eligible applicants include institutions",
  "eligible applicants are ihes",
  "eligible entities",
  "eligible entity",
  "state educational agencies",
  "local educational agencies",
  "state education agencies",
  "local education agencies",
  "awarded to institutions",
  "grants to institutions",
  "grants are made to institutions",
  "funds are awarded to schools",
  "assistance listing number",
  "cfda number",
  "notice inviting applications",
  "absolute priority",
  "competitive preference priority",
];

const INSTITUTION_GRANT_DOMAINS = [
  "grants.gov",
  "simpler.grants.gov",
  "federalregister.gov",
  "grantsolutions.gov",
  "sam.gov",
  // The Department of Education's grant-programs subtree is discretionary
  // funding to institutions/agencies; student aid lives at studentaid.gov.
  "ed.gov/grants-and-programs",
];

export function looksLikeInstitutionFacingGrant({
  title,
  url,
  text,
}: {
  title?: unknown;
  url?: unknown;
  text?: unknown;
}): { isInstitutionGrant: boolean; reason: string | null } {
  const combined = normalize(`${title || ""} ${text || ""}`);
  const urlText = String(url || "").toLowerCase();

  const domainHit = INSTITUTION_GRANT_DOMAINS.find((domain) =>
    urlText.includes(domain)
  );

  // The grants.gov ecosystem is exclusively organization-facing — a student
  // never applies there. One domain hit is decisive.
  if (domainHit) {
    return {
      isInstitutionGrant: true,
      reason: `Application lives in the institution-facing grants ecosystem (${domainHit}) — the applicant is an organization, not a student.`,
    };
  }

  // Text-only detection needs two independent signals so a student program
  // that merely mentions "eligible entities" once is never nuked.
  const signalHits = INSTITUTION_APPLICANT_SIGNALS.filter((signal) =>
    combined.includes(normalize(signal))
  );
  if (signalHits.length >= 2) {
    return {
      isInstitutionGrant: true,
      reason: `Page describes institution-facing funding ("${signalHits[0]}" + "${signalHits[1]}") — the applicant is an organization, not a student.`,
    };
  }

  return { isInstitutionGrant: false, reason: null };
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

  const degreeCheck = looksLikeDegreeProgramRecord({
    title,
    text: `${description || ""} ${ai_summary || ""}`,
  });
  if (degreeCheck.isDegree) {
    return {
      reject: true,
      reason: `Outside target scope: ${degreeCheck.reason}`,
    };
  }

  const institutionCheck = looksLikeInstitutionFacingGrant({
    title,
    url,
    text: `${description || ""} ${ai_summary || ""}`,
  });
  if (institutionCheck.isInstitutionGrant) {
    return {
      reject: true,
      reason: `Outside target scope: ${institutionCheck.reason}`,
    };
  }

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

  // Degree/admissions pages with no funding language never reach extraction.
  const degreeCheck = looksLikeDegreeProgramRecord({ title, text });
  if (degreeCheck.isDegree && !hasStrongAllowedSignal) {
    return {
      reject: true,
      reason: `Pre-extraction scope reject: ${degreeCheck.reason}`,
    };
  }

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

