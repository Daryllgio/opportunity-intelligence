/**
 * Central domain policy for the discovery pipeline.
 *
 * This is the single source of truth for every domain judgement the pipeline
 * makes: which domains are aggregators, which may never be application
 * destinations, which are recognized application portals, and how to decide
 * whether a provider name "owns" a domain.
 *
 * Rules of thumb:
 * - Aggregators may be used for DISCOVERY (finding that an opportunity
 *   exists) but must never be returned as an application DESTINATION.
 * - Social/informational/news/generic-hosting domains are never destinations
 *   regardless of how relevant the page content looks.
 * - Recognized application portals (SmApply, AwardSpring, Google Forms, …)
 *   are legitimate destinations even though they are third-party domains.
 */

export function getDomain(urlOrDomain: string | null | undefined): string | null {
  const raw = String(urlOrDomain || "").trim();

  if (!raw) return null;

  if (raw.includes("://")) {
    try {
      return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return null;
    }
  }

  // Already a bare domain.
  const bare = raw.replace(/^www\./, "").toLowerCase().split("/")[0];
  return bare || null;
}

export function domainMatches(domain: string, knownDomain: string) {
  return domain === knownDomain || domain.endsWith(`.${knownDomain}`);
}

export function domainInSet(
  domain: string | null | undefined,
  domains: ReadonlySet<string>
) {
  if (!domain) return false;

  for (const knownDomain of domains) {
    if (domainMatches(domain, knownDomain)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Domain lists
// ---------------------------------------------------------------------------

export const SOCIAL_MEDIA_DOMAINS: ReadonlySet<string> = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "reddit.com",
  "threads.net",
  "pinterest.com",
  "snapchat.com",
  "discord.com",
  "discord.gg",
]);

export const INFORMATIONAL_DOMAINS: ReadonlySet<string> = new Set([
  "wikipedia.org",
  "wikimedia.org",
  "wiktionary.org",
  "medium.com",
  "quora.com",
  "about.com",
  "wikihow.com",
  "britannica.com",
  "fandom.com",
  "stackexchange.com",
  "stackoverflow.com",
]);

export const NEWS_DOMAINS: ReadonlySet<string> = new Set([
  "news.google.com",
  "apple.news",
  "cnn.com",
  "bbc.com",
  "bbc.co.uk",
  "nytimes.com",
  "washingtonpost.com",
  "theguardian.com",
  "reuters.com",
  "apnews.com",
  "usatoday.com",
  "forbes.com",
  // Press-release wires — pages about opportunities, never the application.
  "prnewswire.com",
  "businesswire.com",
  "newswire.com",
  "accessnewswire.com",
  "globenewswire.com",
]);

/** Hosted-site platforms. A scholarship hosted on one of these may be real,
 * but the platform domain itself can never be auto-verified as official. */
export const GENERIC_HOSTING_DOMAINS: ReadonlySet<string> = new Set([
  "wordpress.com",
  "blogspot.com",
  "tumblr.com",
  "substack.com",
  "wix.com",
  "wixsite.com",
  "weebly.com",
  "squarespace.com",
  "godaddysites.com",
]);

export const SEARCH_AND_APP_STORE_DOMAINS: ReadonlySet<string> = new Set([
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "search.yahoo.com",
  "apps.apple.com",
  "play.google.com",
  "bbb.org",
]);

/**
 * Opportunity aggregators/databases/list sites. Useful discovery fuel,
 * never an application destination.
 */
export const AGGREGATOR_DOMAINS: ReadonlySet<string> = new Set([
  // Major scholarship aggregators.
  "scholarships.com",
  "fastweb.com",
  "bold.org",
  "niche.com",
  "scholarshipowl.com",
  "cappex.com",
  "unigo.com",
  "goingmerry.com",
  "scholarships360.org",
  "studentscholarships.org",
  "brokescholar.com",
  "collegegreenlight.com",
  "appily.com",
  "petersons.com",
  "careerkarma.com",
  "accessscholarships.com",
  "scholarshiproar.com",
  "scholarshippoints.com",
  "scholarshipbuddy.com",
  "chegg.com",
  "internships.com",
  "wayup.com",
  "handshake.com",
  "joinhandshake.com",
  // Additional aggregators/list/advice sites seen in live campaign data.
  "collegescholarships.org",
  "scholarshipscanada.com",
  "scholarshipguidance.com",
  "scholarshipinstitute.org",
  "collegevine.com",
  "collegewhale.com",
  "greatvaluecolleges.net",
  "scholarshipsandgrants.us",
  "sallie.com",
  "salliemae.com",
  "biglawinvestor.com",
  "mastersportal.com",
  "bachelorsportal.com",
  "findamasters.com",
  "findaphd.com",
  "hotcoursesabroad.com",
  "wemakescholars.com",
  "amberstudent.com",
  "scholarsavenue.com",
  "uscaacademy.com",
  "scholarshipca.com",
  "bemoacademicconsulting.com",
  "topuniversities.com",
  "applykite.com",
  "gyandhan.com",
  "yocket.com",
  "leverageedu.com",
  "upgrad.com",
  "shemmassianconsulting.com",
  "medschoolcoach.com",
  "boardvitals.com",
  "lumiere-education.com",
  "ladderinternships.com",
  "mehtaplustutoring.com",
  "pioneeracademics.com",
  "logolife.org",
  "mswhelper.com",
  "iefa.org",
  "opportunitiescircle.com",
  "scholarshipscorner.website",
  "opportunitiesforyouth.org",
  "scholarshipunion.com",
  "theeducationstory.com",
  "fdpzone.com",
  "scholarsworld.ng",
  "persmind.com",
  "resultuniraj.co.in",
  "oyaop.com",
  "bridgeseduscholarships.com",
  "immigrationnewscanada.ca",
  "academiquirk.com",
  "chcinextopp.com",
]);

/** Curated secondary databases we trust for discovery (never destinations). */
export const TRUSTED_DATABASE_DOMAINS: ReadonlySet<string> = new Set([
  "pathwaystoscience.org",
  "profellow.com",
]);

/** Known official opportunity providers (allow-list). */
export const OFFICIAL_PROVIDER_DOMAINS: ReadonlySet<string> = new Set([
  "innovation.ca",
  "bmifoundation.org",
  "wdc.org",
  "seafwa.org",
  "nysra.org",
  "napawash.org",
]);

/** Recognized third-party application platforms — legitimate destinations. */
export const APPLICATION_PORTAL_DOMAINS: ReadonlySet<string> = new Set([
  "smapply.io",
  "awardspring.com",
  "submittable.com",
  "fluidreview.com",
  "academicworks.com",
  "applyists.net",
  "surveyapply.com",
  "wizehive.com",
  "reviewr.com",
]);

/** Portal URL fragments for form platforms whose base domains are otherwise blocked. */
const APPLICATION_PORTAL_URL_SIGNALS = [
  "forms.office.com",
  "docs.google.com/forms",
  "form.jotform.com",
  "jotform.com/form",
  "typeform.com/to/",
];

/** Explicit Canadian university domains (no reliable TLD pattern exists). */
const CANADIAN_UNIVERSITY_DOMAINS: ReadonlySet<string> = new Set([
  "mcgill.ca",
  "utoronto.ca",
  "ubc.ca",
  "uwaterloo.ca",
  "queensu.ca",
  "ualberta.ca",
  "ucalgary.ca",
  "yorku.ca",
  "mcmaster.ca",
  "uottawa.ca",
  "carleton.ca",
  "sfu.ca",
  "concordia.ca",
  "dal.ca",
  "umanitoba.ca",
  "usask.ca",
  "uvic.ca",
  "uwo.ca",
  "uwindsor.ca",
  "unb.ca",
  "mun.ca",
  "uregina.ca",
  "brocku.ca",
  "uoguelph.ca",
  "tmu.ca",
  "ulaval.ca",
  "umontreal.ca",
  "polymtl.ca",
  "etsmtl.ca",
  "uqam.ca",
]);

// ---------------------------------------------------------------------------
// Category + predicate helpers
// ---------------------------------------------------------------------------

export type DomainPolicyCategory =
  | "social"
  | "informational"
  | "news"
  | "generic_hosting"
  | "search_or_app_store"
  | "aggregator"
  | "trusted_database"
  | "application_portal"
  | "official_provider"
  | null;

export function getDomainPolicyCategory(
  urlOrDomain: string | null | undefined
): DomainPolicyCategory {
  const domain = getDomain(urlOrDomain);

  if (!domain) return null;

  if (domainInSet(domain, SOCIAL_MEDIA_DOMAINS)) return "social";
  if (domainInSet(domain, INFORMATIONAL_DOMAINS)) return "informational";
  if (domainInSet(domain, NEWS_DOMAINS)) return "news";
  if (domainInSet(domain, SEARCH_AND_APP_STORE_DOMAINS)) return "search_or_app_store";
  if (domainInSet(domain, AGGREGATOR_DOMAINS)) return "aggregator";
  if (domainInSet(domain, TRUSTED_DATABASE_DOMAINS)) return "trusted_database";
  if (domainInSet(domain, APPLICATION_PORTAL_DOMAINS)) return "application_portal";
  if (domainInSet(domain, OFFICIAL_PROVIDER_DOMAINS)) return "official_provider";
  if (domainInSet(domain, GENERIC_HOSTING_DOMAINS)) return "generic_hosting";

  return null;
}

export function isAggregatorDomain(urlOrDomain: string | null | undefined) {
  return domainInSet(getDomain(urlOrDomain), AGGREGATOR_DOMAINS);
}

export function isRecognizedApplicationPortalUrl(
  url: string | null | undefined
) {
  const raw = String(url || "").toLowerCase();

  if (!raw) return false;

  if (APPLICATION_PORTAL_URL_SIGNALS.some((signal) => raw.includes(signal))) {
    return true;
  }

  return domainInSet(getDomain(raw), APPLICATION_PORTAL_DOMAINS);
}

/**
 * May this URL EVER be an application destination? Blocks aggregators,
 * social, informational, news, search/app-store, and generic hosting —
 * with a carve-out for recognized form platforms (Google Forms etc.).
 */
export function isBlockedDestinationUrl(url: string | null | undefined) {
  if (!url) return true;

  if (isRecognizedApplicationPortalUrl(url)) return false;

  const category = getDomainPolicyCategory(url);

  return (
    category === "social" ||
    category === "informational" ||
    category === "news" ||
    category === "search_or_app_store" ||
    category === "generic_hosting" ||
    category === "aggregator" ||
    category === "trusted_database"
  );
}

/** Should discovery search results from this URL be dropped outright? */
export function isBlockedDiscoveryUrl(url: string | null | undefined) {
  if (!url) return true;

  const category = getDomainPolicyCategory(url);

  return (
    category === "social" ||
    category === "informational" ||
    category === "news" ||
    category === "search_or_app_store"
  );
}

export function isUniversityDomain(urlOrDomain: string | null | undefined) {
  const domain = getDomain(urlOrDomain);

  if (!domain) return false;

  if (
    domain.endsWith(".edu") ||
    domain.includes(".edu.") || // .edu.au, .edu.ng, …
    domain.endsWith(".ac.uk") ||
    domain.includes(".ac.") // .ac.nz, .ac.jp, …
  ) {
    return true;
  }

  return domainInSet(domain, CANADIAN_UNIVERSITY_DOMAINS);
}

export function isGovernmentDomain(urlOrDomain: string | null | undefined) {
  const domain = getDomain(urlOrDomain);

  if (!domain) return false;

  return (
    domain.endsWith(".gov") ||
    domain.includes(".gov.") || // .gov.on.ca, .gov.uk, …
    domain.endsWith(".gc.ca") ||
    domain === "canada.ca" ||
    domain.endsWith(".canada.ca") ||
    domain.endsWith(".gouv.qc.ca") ||
    domain.endsWith(".mil")
  );
}

// ---------------------------------------------------------------------------
// Provider ↔ domain ownership
// ---------------------------------------------------------------------------

const PROVIDER_STOPWORDS = new Set([
  "the",
  "of",
  "for",
  "and",
  "in",
  "at",
  "a",
  "an",
  "inc",
  "llc",
  "ltd",
  "co",
  "org",
  "organization",
  "organisation",
  "foundation",
  "fund",
  "trust",
  "association",
  "society",
  "institute",
  "institution",
  "program",
  "programs",
  "scholarship",
  "scholarships",
  "fellowship",
  "fellowships",
  "award",
  "awards",
  "grant",
  "grants",
  "national",
  "international",
  "american",
  "canadian",
  "company",
  "corp",
  "corporation",
  "group",
]);

const GENERIC_TLD_LABELS = new Set([
  "com",
  "org",
  "net",
  "edu",
  "gov",
  "mil",
  "int",
  "info",
  "io",
  "co",
  "us",
  "ca",
  "uk",
  "au",
  "nz",
  "ac",
  "gc",
  "on",
  "qc",
  "bc",
  "gouv",
  "www",
]);

/** Meaningful (non-TLD) labels of a hostname, most-specific last. */
function getDomainLabels(domain: string): string[] {
  return domain
    .split(".")
    .map((label) => label.toLowerCase())
    .filter((label) => label && !GENERIC_TLD_LABELS.has(label));
}

function getProviderTokens(provider: string): string[] {
  return String(provider || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 2 && !PROVIDER_STOPWORDS.has(token));
}

export type ProviderDomainMatch = {
  matched: boolean;
  reason: string | null;
};

/**
 * Does the provider name plausibly OWN this domain?
 *
 * Handles the concatenated-domain problem token overlap cannot:
 *   "Gwags Foundation"  ↔ gwagsfoundation.org   (token inside label)
 *   "TD Bank"           ↔ td.com                (exact short token)
 *   "Loran Scholars Foundation" ↔ loranscholar.ca (prefix concatenation)
 *
 * This is intentionally about DOMAIN ownership only. A page merely
 * mentioning the provider (Wikipedia, news) must never pass this check.
 */
export function providerMatchesDomain(
  provider: string | null | undefined,
  urlOrDomain: string | null | undefined
): ProviderDomainMatch {
  const domain = getDomain(urlOrDomain);
  const providerText = String(provider || "").trim();

  if (!domain || !providerText) {
    return { matched: false, reason: null };
  }

  const labels = getDomainLabels(domain);
  const tokens = getProviderTokens(providerText);
  // Include dropped stopword-only providers ("The Fund") via raw tokens too.
  const rawTokens = String(providerText)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 2);

  if (!labels.length || !rawTokens.length) {
    return { matched: false, reason: null };
  }

  const concatenated = rawTokens.join("");
  const concatenatedMeaningful = tokens.join("");
  const acronym = rawTokens.map((token) => token[0]).join("");

  for (const label of labels) {
    // Exact token match ("td" === "td").
    if (rawTokens.some((token) => token === label)) {
      return { matched: true, reason: `Provider token matches domain label "${label}".` };
    }

    // Provider token embedded in label ("gwags" ⊂ "gwagsfoundation").
    if (
      tokens.some((token) => token.length >= 4 && label.includes(token)) ||
      rawTokens.some((token) => token.length >= 5 && label.includes(token))
    ) {
      return {
        matched: true,
        reason: `Provider name appears inside domain label "${label}".`,
      };
    }

    // Label embedded in concatenated provider ("loranscholar" ⊂ "loranscholarsfoundation").
    if (label.length >= 5 && (concatenated.includes(label) || concatenatedMeaningful.includes(label))) {
      return {
        matched: true,
        reason: `Domain label "${label}" appears inside the provider name.`,
      };
    }

    // Acronym match ("nsf" for National Science Foundation).
    if (acronym.length >= 3 && label === acronym) {
      return { matched: true, reason: `Domain label "${label}" matches provider acronym.` };
    }
  }

  return { matched: false, reason: null };
}
