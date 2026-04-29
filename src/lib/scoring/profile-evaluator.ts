import type {
  AwardEntry,
  ExperienceEntry,
  ProfileStrengthAnalysis,
  StudentProfileForScoring,
} from "./types";

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function hasText(value?: string | null) {
  return Boolean(value && value.trim().length > 0);
}

function textScore(value?: string | null) {
  if (!value) return 0;
  const length = value.trim().length;

  if (length > 450) return 95;
  if (length > 250) return 85;
  if (length > 120) return 70;
  if (length > 50) return 50;
  if (length > 0) return 25;

  return 0;
}

function hasMeasurableImpact(text?: string | null) {
  if (!text) return false;
  return /\d|percent|%|raised|led|founded|created|launched|published|presented|served|managed|organized|built|increased|reduced|awarded/i.test(
    text
  );
}

function institutionSignal(name?: string | null) {
  if (!name) return 25;

  const eliteSignals = [
    "harvard",
    "stanford",
    "mit",
    "massachusetts institute",
    "oxford",
    "cambridge",
    "princeton",
    "yale",
    "columbia",
    "berkeley",
    "johns hopkins",
    "mcgill",
    "toronto",
    "waterloo",
    "ubc",
  ];

  const lower = name.toLowerCase();

  if (eliteSignals.some((signal) => lower.includes(signal))) return 90;
  if (lower.includes("university") || lower.includes("college")) return 65;

  return 45;
}

function evaluateExperience(entries?: ExperienceEntry[] | null, category = "general") {
  if (!entries || entries.length === 0) return 0;

  const entryScores = entries.map((entry) => {
    let score = 20;

    const combined = [
      entry.title,
      entry.organization,
      entry.description,
      entry.impact,
      entry.link,
    ]
      .filter(Boolean)
      .join(" ");

    if (hasText(entry.title)) score += 10;
    if (hasText(entry.organization)) score += 10;
    if (hasText(entry.description)) score += textScore(entry.description) * 0.25;
    if (hasText(entry.impact)) score += textScore(entry.impact) * 0.25;
    if (hasMeasurableImpact(combined)) score += 15;
    if (hasText(entry.link)) score += 5;

    if (/founder|co-founder|president|director|lead|manager|chair/i.test(combined)) {
      score += 12;
    }

    if (/research|lab|paper|publication|poster|conference|data|experiment|analysis/i.test(combined)) {
      score += category === "research" ? 15 : 5;
    }

    if (/nonprofit|community|volunteer|served|outreach|mentor|tutor|social impact/i.test(combined)) {
      score += category === "community" ? 15 : 5;
    }

    return clamp(score);
  });

  const best = Math.max(...entryScores);
  const consistencyBonus = Math.min(15, (entries.length - 1) * 5);

  return clamp(best + consistencyBonus);
}

function evaluateAwards(awards?: AwardEntry[] | null) {
  if (!awards || awards.length === 0) return 0;

  const scores = awards.map((award) => {
    const combined = [award.name, award.organization, award.description]
      .filter(Boolean)
      .join(" ");

    let score = 25;

    if (hasText(award.name)) score += 15;
    if (hasText(award.organization)) score += 10;
    if (hasText(award.description)) score += textScore(award.description) * 0.25;

    if (/national|international|global|gold|first place|winner|scholarship|fellowship|award/i.test(combined)) {
      score += 20;
    }

    if (hasMeasurableImpact(combined)) score += 10;

    return clamp(score);
  });

  return clamp(Math.max(...scores) + Math.min(10, (awards.length - 1) * 3));
}

function evaluateAcademic(profile: StudentProfileForScoring) {
  let score = 30;

  if (profile.gpa !== null && profile.gpa !== undefined) {
    if (profile.gpa >= 3.9) score += 55;
    else if (profile.gpa >= 3.7) score += 45;
    else if (profile.gpa >= 3.4) score += 35;
    else if (profile.gpa >= 3.0) score += 25;
    else score += 10;
  }

  if (hasText(profile.education_level)) score += 5;
  if (hasText(profile.field_of_study) || hasText(profile.field_of_study_other)) score += 5;
  if (hasText(profile.school) || hasText(profile.school_other)) score += 5;

  return clamp(score);
}

function evaluateCompleteness(profile: StudentProfileForScoring) {
  const fields = [
    profile.nationality,
    profile.country_of_study,
    profile.student_status,
    profile.school || profile.school_other,
    profile.education_level,
    profile.field_of_study || profile.field_of_study_other,
    profile.gpa?.toString(),
  ];

  const filledBase = fields.filter(Boolean).length;
  const experienceCount =
    (profile.leadership_experiences?.length || 0) +
    (profile.research_experiences?.length || 0) +
    (profile.volunteer_experiences?.length || 0) +
    (profile.work_project_experiences?.length || 0) +
    (profile.awards?.length || 0);

  return clamp((filledBase / fields.length) * 70 + Math.min(30, experienceCount * 6));
}

export function evaluateProfileStrength(
  profile: StudentProfileForScoring
): ProfileStrengthAnalysis {
  const schoolName =
    profile.school === "Other" ? profile.school_other : profile.school;

  const leadership = evaluateExperience(profile.leadership_experiences, "leadership");
  const research = evaluateExperience(profile.research_experiences, "research");
  const community = evaluateExperience(profile.volunteer_experiences, "community");
  const workProject = evaluateExperience(profile.work_project_experiences, "work");
  const awards = evaluateAwards(profile.awards);

  const evidenceQuality = clamp(
    (leadership + research + community + workProject + awards) / 5
  );

  return {
    academic_strength: evaluateAcademic(profile),
    research_strength: research,
    leadership_strength: leadership,
    community_impact_strength: community,
    work_project_strength: workProject,
    awards_strength: awards,
    institution_signal: institutionSignal(schoolName),
    profile_completeness: evaluateCompleteness(profile),
    evidence_quality: evidenceQuality,
  };
}
