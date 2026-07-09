/**
 * Profile-completeness gate for scoring.
 *
 * Scoring runs only when the five fields every match depends on are present:
 * education level, country of study, school, major/field, and nationality.
 * Experience is deliberately NOT required — a high-school student with an
 * empty resume still gets scored (and scores well where experience isn't the
 * selection criterion); they just see a nudge that experiences sharpen
 * accuracy.
 */

export type ProfileGateResult = {
  complete: boolean;
  missing: string[]; // human-readable field names
  experienceNudge: boolean;
};

const FIELD_LABELS: Record<string, string> = {
  education_level: "education level",
  country_of_study: "country of study",
  school: "school",
  field_of_study: "field of study",
  nationality: "nationality",
};

function present(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export function profileScoringGate(
  profile: Record<string, unknown> | null | undefined
): ProfileGateResult {
  if (!profile) {
    return {
      complete: false,
      missing: Object.values(FIELD_LABELS),
      experienceNudge: false,
    };
  }

  const missing: string[] = [];

  if (!present(profile.education_level)) missing.push(FIELD_LABELS.education_level);
  if (!present(profile.country_of_study)) missing.push(FIELD_LABELS.country_of_study);
  if (!present(profile.school) && !present(profile.school_other)) {
    missing.push(FIELD_LABELS.school);
  }
  // "Undeclared / Undecided" is a real answer, not a gap.
  if (!present(profile.field_of_study) && !present(profile.field_of_study_other)) {
    missing.push(FIELD_LABELS.field_of_study);
  }
  if (!present(profile.nationality)) missing.push(FIELD_LABELS.nationality);

  const experienceCount = [
    profile.leadership_experiences,
    profile.research_experiences,
    profile.volunteer_experiences,
    profile.work_project_experiences,
  ].reduce<number>(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0
  );

  return {
    complete: missing.length === 0,
    missing,
    experienceNudge: missing.length === 0 && experienceCount === 0,
  };
}
