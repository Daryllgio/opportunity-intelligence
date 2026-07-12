/**
 * Exhaustive, level-appropriate field-of-study taxonomies.
 *
 * Fields differ by level: an undergraduate picks a major, an MBA picks a
 * concentration, a JD picks a practice-area interest, an MD an area of
 * interest. Every picker on the platform draws from these lists through
 * fieldOptionsForLevel()/fieldOptionsForNextLevel() — searchable, scrollable,
 * and complete enough that free-typing is never needed. "Undeclared /
 * Undecided" and "Interdisciplinary" absorb the genuinely unlisted.
 */

export const UNDERGRADUATE_MAJORS = [
  "Undeclared / Undecided",
  "Accounting", "Actuarial Science", "Advertising", "Aerospace Engineering",
  "African Studies", "Agricultural Business", "Agriculture", "Animal Science",
  "Animation", "Anthropology", "Applied Mathematics", "Archaeology",
  "Architecture", "Art History", "Artificial Intelligence", "Astronomy",
  "Athletic Training", "Aviation", "Biochemistry", "Bioinformatics",
  "Biology", "Biomedical Engineering", "Biomedical Sciences", "Biophysics",
  "Biotechnology", "Botany", "Business Administration", "Business Analytics",
  "Canadian Studies", "Chemical Engineering", "Chemistry", "Civil Engineering",
  "Classics", "Cognitive Science", "Communications", "Computer Engineering",
  "Computer Science", "Construction Management", "Creative Writing",
  "Criminal Justice", "Criminology", "Cybersecurity", "Dance", "Data Science",
  "Dental Hygiene", "Design", "Digital Media", "Early Childhood Education",
  "Earth Sciences", "East Asian Studies", "Ecology", "Economics", "Education",
  "Electrical Engineering", "Emergency Management", "Engineering (General)",
  "Engineering Physics", "English", "Entrepreneurship", "Environmental Engineering",
  "Environmental Science", "Environmental Studies", "Exercise Science",
  "Fashion Design", "Film & Television", "Finance", "Fine Arts",
  "Fisheries & Wildlife", "Food Science", "Forensic Science", "Forestry",
  "French", "Game Design", "Gender & Women's Studies", "Genetics", "Geography",
  "Geology", "German", "Gerontology", "Global Health", "Graphic Design",
  "Health Administration", "Health Informatics", "Health Sciences", "History",
  "Horticulture", "Hospitality Management", "Human Kinetics", "Human Resources",
  "Immunology", "Indigenous Studies", "Industrial Design", "Industrial Engineering",
  "Information Systems", "Information Technology", "Interior Design",
  "International Business", "International Development", "International Relations",
  "Journalism", "Kinesiology", "Labor Studies", "Landscape Architecture",
  "Latin American Studies", "Legal Studies", "Liberal Arts", "Linguistics",
  "Management", "Marine Biology", "Marketing", "Materials Science & Engineering",
  "Mathematics", "Mechanical Engineering", "Mechatronics", "Media Studies",
  "Medical Laboratory Science", "Meteorology", "Microbiology",
  "Middle Eastern Studies", "Mining Engineering", "Music", "Music Production",
  "Neuroscience", "Nuclear Engineering", "Nursing", "Nutrition & Dietetics",
  "Occupational Health & Safety", "Oceanography", "Operations Management",
  "Paramedicine", "Petroleum Engineering", "Pharmacology", "Philosophy",
  "Photography", "Physics", "Physiology", "Political Science", "Pre-Dentistry",
  "Pre-Law", "Pre-Medicine", "Pre-Pharmacy", "Pre-Veterinary", "Psychology",
  "Public Administration", "Public Health", "Public Policy", "Public Relations",
  "Real Estate", "Rehabilitation Sciences", "Religious Studies",
  "Respiratory Therapy", "Robotics", "Social Work", "Sociology",
  "Software Engineering", "Spanish", "Speech-Language Pathology (Pre)",
  "Sport Management", "Statistics", "Supply Chain Management",
  "Sustainability", "Theatre", "Toxicology", "Urban Planning",
  "Veterinary Technology", "Visual Arts", "Zoology", "Interdisciplinary Studies",
] as const;

export const MASTERS_FIELDS = [
  "Accounting (MAcc)", "Aerospace Engineering", "Agricultural Science",
  "Applied Linguistics / TESOL", "Applied Mathematics", "Architecture (M.Arch)",
  "Artificial Intelligence / Machine Learning", "Astronomy & Astrophysics",
  "Biochemistry", "Bioinformatics", "Biology", "Biomedical Engineering",
  "Biomedical Sciences", "Biostatistics", "Business Analytics", "Chemical Engineering",
  "Chemistry", "Civil Engineering", "Clinical Psychology", "Communication & Media",
  "Computational Biology", "Computer Engineering", "Computer Science",
  "Counseling Psychology", "Creative Writing (MFA)", "Criminology & Criminal Justice",
  "Cybersecurity", "Data Science & Analytics", "Development Studies",
  "Earth & Atmospheric Sciences", "Ecology & Evolutionary Biology", "Economics",
  "Education (MEd)", "Educational Leadership", "Electrical Engineering",
  "Engineering Management", "English Literature", "Environmental Engineering",
  "Environmental Science & Management", "Epidemiology", "Film Production",
  "Finance (MFin)", "Fine Arts / Studio Art (MFA)", "Food Science",
  "Forestry & Natural Resources", "Genetic Counseling", "Geography", "Geology",
  "Health Administration (MHA)", "Health Informatics", "History",
  "Human-Computer Interaction", "Human Resources Management", "Immunology",
  "Industrial Engineering", "International Affairs / Relations",
  "Journalism", "Kinesiology & Exercise Science", "Landscape Architecture",
  "Library & Information Science", "Linguistics", "Marketing",
  "Materials Science & Engineering", "Mathematics", "Mechanical Engineering",
  "Microbiology", "Midwifery", "Museum Studies", "Music (Performance/Composition)",
  "Neuroscience", "Nursing (MSN)", "Nutrition & Dietetics",
  "Occupational Therapy", "Operations Research", "Pharmacology",
  "Philosophy", "Physician Assistant Studies", "Physics", "Physiotherapy / Physical Therapy",
  "Political Science", "Project Management", "Psychology", "Public Administration (MPA)",
  "Public Health (MPH)", "Public Policy (MPP)", "Quantitative Finance",
  "Real Estate Development", "Robotics", "School Psychology", "Social Work (MSW)",
  "Sociology", "Software Engineering", "Speech-Language Pathology",
  "Sport Management", "Statistics", "Supply Chain Management",
  "Sustainability & Climate", "Systems Engineering", "Taxation",
  "Theology / Divinity", "Translation & Interpretation", "Urban Planning",
  "Interdisciplinary Studies",
] as const;

export const PHD_FIELDS = [
  "Aerospace Engineering", "Anthropology", "Applied Mathematics",
  "Artificial Intelligence / Machine Learning", "Astronomy & Astrophysics",
  "Biochemistry", "Bioengineering", "Bioinformatics & Computational Biology",
  "Biology", "Biomedical Sciences", "Biophysics", "Biostatistics",
  "Business (PhD)", "Chemical Engineering", "Chemistry", "Civil Engineering",
  "Classics", "Clinical Psychology", "Cognitive Science", "Communication",
  "Computer Engineering", "Computer Science", "Criminology", "Earth Sciences",
  "Ecology & Evolutionary Biology", "Economics", "Education", "Electrical Engineering",
  "English Literature", "Environmental Engineering", "Environmental Science",
  "Epidemiology", "Genetics & Genomics", "Geography", "Geology", "History",
  "Immunology", "Industrial Engineering", "Kinesiology", "Linguistics",
  "Materials Science & Engineering", "Mathematics", "Mechanical Engineering",
  "Microbiology", "Molecular Biology", "Music", "Neuroscience", "Nursing (PhD)",
  "Pharmacology & Toxicology", "Philosophy", "Physics", "Physiology",
  "Political Science", "Psychology", "Public Health", "Public Policy",
  "Religious Studies", "Robotics", "Social Work", "Sociology", "Statistics",
  "Interdisciplinary Studies",
] as const;

export const MBA_CONCENTRATIONS = [
  "General Management / Undecided", "Business Analytics", "Consulting & Strategy",
  "Economics", "Entrepreneurship", "Finance", "Healthcare Management",
  "Human Resources & Organizational Behavior", "International Business",
  "Marketing", "Operations Management", "Product Management",
  "Real Estate", "Social Impact & Nonprofit", "Supply Chain Management",
  "Sustainability & ESG", "Technology Management",
] as const;

export const LAW_FIELDS = [
  "Law (General / Undecided)", "Business & Corporate Law", "Constitutional Law",
  "Criminal Law", "Entertainment & Media Law", "Environmental Law",
  "Family Law", "Health Law", "Human Rights Law", "Immigration Law",
  "Indigenous / Aboriginal Law", "Intellectual Property & Technology Law",
  "International Law", "Labor & Employment Law", "Litigation",
  "Public Interest Law", "Real Estate Law", "Securities & Financial Law",
  "Tax Law",
] as const;

export const MEDICINE_FIELDS = [
  "Medicine (General / Undecided)", "Anesthesiology", "Cardiology",
  "Dermatology", "Emergency Medicine", "Family Medicine", "Global Health",
  "Internal Medicine", "Medical Research (MD-PhD)", "Neurology",
  "Obstetrics & Gynecology", "Oncology", "Ophthalmology", "Orthopedics",
  "Pediatrics", "Psychiatry", "Public Health & Preventive Medicine",
  "Radiology", "Surgery",
] as const;

export const PROFESSIONAL_OTHER_FIELDS = [
  "Audiology (AuD)", "Chiropractic (DC)", "Dentistry (DDS/DMD)",
  "Divinity (MDiv)", "Doctor of Education (EdD)", "Doctor of Nursing Practice (DNP)",
  "Naturopathic Medicine (ND)", "Occupational Therapy (OTD)",
  "Optometry (OD)", "Pharmacy (PharmD)", "Physical Therapy (DPT)",
  "Physician Assistant (PA)", "Podiatry (DPM)", "Public Accounting (CPA path)",
  "Veterinary Medicine (DVM)",
] as const;

/**
 * The list for a student's CURRENT level (profile edit). High schoolers pick
 * the majors they're heading toward; professional students get their
 * program's taxonomy.
 */
export function fieldOptionsForLevel(educationLevel: unknown): string[] {
  const level = String(educationLevel || "").toLowerCase();
  if (level.includes("high")) return [...UNDERGRADUATE_MAJORS];
  if (level.includes("master")) return [...MASTERS_FIELDS];
  if (level.includes("phd") || level.includes("doctor")) return [...PHD_FIELDS];
  if (level.includes("mba")) return [...MBA_CONCENTRATIONS];
  if (level.includes("law")) return [...LAW_FIELDS];
  if (level.includes("medic")) return [...MEDICINE_FIELDS];
  if (level.includes("professional")) return [...PROFESSIONAL_OTHER_FIELDS];
  return [...UNDERGRADUATE_MAJORS];
}

/** The list for a chosen NEXT level (preferences): union over the degree
 * types the student selected, deduplicated, stable order. */
export function fieldOptionsForNextLevel(types: string[]): string[] {
  const out: string[] = [];
  const push = (list: readonly string[]) => {
    for (const item of list) if (!out.includes(item)) out.push(item);
  };
  for (const type of types) {
    if (type === "undergraduate") push(UNDERGRADUATE_MAJORS);
    else if (type === "masters" || type === "masters_other") push(MASTERS_FIELDS);
    else if (type === "phd") push(PHD_FIELDS);
    else if (type === "mba") push(MBA_CONCENTRATIONS);
    else if (type === "jd") push(LAW_FIELDS);
    else if (type === "md") push(MEDICINE_FIELDS);
    else if (type === "professional_other") push(PROFESSIONAL_OTHER_FIELDS);
  }
  if (out.length === 0) push(MASTERS_FIELDS);
  return out;
}
