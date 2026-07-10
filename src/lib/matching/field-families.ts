/**
 * Field-of-study families with overlap — one field can live in several
 * families (biology is STEM and health sciences; economics is business and
 * social science). Used INCLUSIVELY everywhere: families widen what a
 * student matches, never narrow it. A failed field match is grounds for
 * "uncertain", not exclusion — majors are fuzzy, programs surprise you, and
 * the Tier-2 AI resolver owns the genuinely ambiguous cases.
 */

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** family -> member fields. Members may appear in multiple families. */
export const FIELD_FAMILIES: Record<string, string[]> = {
  stem: [
    "computer science", "software engineering", "computer engineering",
    "data science", "artificial intelligence", "machine learning",
    "cybersecurity", "information systems", "information technology",
    "engineering", "electrical engineering", "mechanical engineering",
    "civil engineering", "chemical engineering", "aerospace engineering",
    "biomedical engineering", "industrial engineering", "robotics",
    "mathematics", "applied mathematics", "statistics", "actuarial science",
    "physics", "astronomy", "chemistry", "biology", "biochemistry",
    "biotechnology", "biomedical sciences", "neuroscience", "genetics",
    "microbiology", "environmental science", "geology", "earth sciences",
    "materials science", "science", "technology",
  ],
  "health sciences": [
    "biology", "biochemistry", "biomedical sciences", "biomedical engineering",
    "health sciences", "medicine", "pre-med", "premed", "nursing",
    "public health", "pharmacy", "pharmacology", "dentistry", "neuroscience",
    "kinesiology", "nutrition", "physiotherapy", "occupational therapy",
    "epidemiology", "health informatics", "psychology",
  ],
  "social sciences": [
    "economics", "political science", "psychology", "sociology",
    "anthropology", "international relations", "international development",
    "public policy", "public administration", "criminology", "social work",
    "geography", "urban planning", "linguistics",
  ],
  business: [
    "business", "business administration", "commerce", "finance",
    "accounting", "marketing", "management", "entrepreneurship", "economics",
    "supply chain management", "human resources", "actuarial science",
    "information systems",
  ],
  humanities: [
    "english", "literature", "history", "philosophy", "classics",
    "religious studies", "languages", "linguistics", "creative writing",
    "communications", "journalism", "media studies", "rhetoric",
  ],
  arts: [
    "fine arts", "visual arts", "music", "theatre", "theater", "dance",
    "film", "photography", "graphic design", "design", "architecture",
    "creative writing", "animation",
  ],
  education: ["education", "teaching", "early childhood education", "pedagogy"],
  law: ["law", "legal studies", "criminal justice", "criminology", "political science"],
  agriculture: [
    "agriculture", "agricultural science", "food science", "forestry",
    "animal science", "horticulture", "environmental science",
  ],
};

const FAMILY_NAME_ALIASES: Record<string, string> = {
  stem: "stem",
  "stem fields": "stem",
  "stem majors": "stem",
  "science technology engineering and math": "stem",
  "science technology engineering and mathematics": "stem",
  "health sciences": "health sciences",
  "health science": "health sciences",
  "health": "health sciences",
  "healthcare": "health sciences",
  "health care": "health sciences",
  "medical fields": "health sciences",
  "social sciences": "social sciences",
  "social science": "social sciences",
  business: "business",
  "business fields": "business",
  humanities: "humanities",
  arts: "arts",
  "the arts": "arts",
  "creative fields": "arts",
  education: "education",
  law: "law",
  "legal fields": "law",
  agriculture: "agriculture",
  trades: "trades",
};

/** All families a specific field belongs to (plus the field itself). */
export function fieldFamiliesOf(field: unknown): string[] {
  const normalized = normalizeText(field);
  if (!normalized) return [];
  const out = [normalized];
  for (const [family, members] of Object.entries(FIELD_FAMILIES)) {
    if (
      members.some(
        (member) =>
          member === normalized ||
          normalized.includes(member) ||
          member.includes(normalized)
      )
    ) {
      out.push(family);
    }
  }
  return Array.from(new Set(out));
}

/**
 * Does any of the student's fields satisfy any required value?
 * Required values can be specific majors ("mechanical engineering"),
 * family names ("STEM fields"), or free text. Inclusive by design.
 */
export function fieldSatisfies(
  profileFields: string[],
  requiredValues: string[]
): boolean {
  const userFamilies = new Set(
    profileFields.flatMap((field) => fieldFamiliesOf(field))
  );
  if (userFamilies.size === 0) return false;

  for (const raw of requiredValues) {
    const value = normalizeText(raw);
    if (!value) continue;

    // Family-name requirement ("STEM fields") — match through families.
    const familyName = FAMILY_NAME_ALIASES[value];
    if (familyName && userFamilies.has(familyName)) return true;

    // Specific-field requirement — direct or fuzzy containment, then
    // family bridge (requirement "biology" met by a biochemistry student
    // only via explicit family, so keep this conservative: containment).
    for (const family of userFamilies) {
      if (family === value || family.includes(value) || value.includes(family)) {
        return true;
      }
    }
  }
  return false;
}
