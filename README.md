# OppScore

OppScore is an AI-powered opportunity intelligence platform that helps students discover, evaluate, and prioritize scholarships, fellowships, research programs, leadership programs, competitions, grants, and other career-building opportunities.

The platform compares eligible opportunities against a student’s academic background, experiences, interests, and goals, then assigns competitiveness scores to help users understand where they are strongest and where they may need better positioning. OppScore is designed to reduce the time students spend searching across scattered databases and help them focus on the opportunities most worth pursuing.

OppScore is currently in final testing and product refinement before public launch.

---

## Product Overview

Students often struggle to identify which scholarships, fellowships, research programs, and professional development opportunities are actually worth their time. Traditional opportunity databases usually provide search and filters, but they do not evaluate a student’s profile against each opportunity’s eligibility requirements, selection criteria, and competitiveness factors.

OppScore solves this by combining structured profile data, AI-assisted opportunity extraction, profile-based matching, competitiveness scoring, and gap reports into one platform.

The core product experience is simple:

1. A student builds a structured profile.
2. OppScore evaluates opportunities against that profile.
3. The platform assigns competitiveness scores to eligible opportunities.
4. Students can view ranked opportunities, save opportunities, track deadlines, and generate deeper gap reports.
5. Paid plans unlock broader profile-based matching, competitiveness ranking, and application guidance.

---

## Core Features

### Profile-Based Opportunity Matching

OppScore uses structured profile information to determine which opportunities are relevant to each student. The profile includes academic background, nationality, country of study, education level, field of study, GPA, target opportunity categories, and student experiences.

The platform supports structured experience categories such as:

- Leadership experience
- Research experience
- Volunteer experience
- Work and project experience
- Awards and honors

These structured categories allow the platform to compare a student’s background against opportunity requirements more accurately than a generic keyword search.

---

### Competitiveness Scoring

OppScore assigns competitiveness scores to opportunities based on how well a student’s profile aligns with the opportunity’s eligibility criteria and selection factors.

The scoring system considers factors such as:

- Education level
- Field of study
- Nationality and country of study
- Opportunity type
- Research experience
- Leadership experience
- Volunteer and community impact
- Awards and achievements
- Project/work experience
- Funding type, deadline, and opportunity criteria

Scores are designed to help students decide where to focus their application effort.

---

### Gap Reports

Gap reports provide a deeper explanation of a student’s positioning for a specific opportunity.

A gap report includes:

- Overall competitiveness score
- Fit label
- Eligibility status
- Key strengths
- Profile gaps
- Recommended positioning guidance
- AI-generated explanation of the student’s fit

Gap reports are designed to be practical and application-focused. Instead of giving generic advice, they help the student understand how to present existing experiences, coursework, projects, goals, and background in a stronger way.

---

### Experience Summarization

OppScore uses Gemini-powered experience summarization to convert structured experience entries into concise, scoring-ready summaries.

The system summarizes individual experiences and stores reusable summaries so that unchanged experiences do not need to be reprocessed repeatedly. This improves scoring consistency and reduces unnecessary AI usage.

---

### Scoring Versioning and Stale Score Handling

OppScore includes a production-style scoring versioning system.

Each competitiveness score stores:

- `profile_scoring_hash`
- `opportunity_content_hash`
- `score_status`
- `stale_reason`
- `last_scored_at`

This allows the platform to determine whether a saved score is still current.

A score can become stale if:

- The student meaningfully updates their profile
- Experience summaries change
- An opportunity’s criteria or content changes
- An old score was created before version tracking was added

Only current scores are shown on the dashboard and opportunity pages.

---

### Scheduled Scoring Jobs

OppScore does not rescore opportunities every time a student presses save.

Instead, profile updates schedule scoring jobs. This prevents unnecessary AI usage when users make repeated edits while building or refining their profiles.

Current scoring behavior:

- Initial scoring runs immediately for new paid users.
- Premium users receive faster refresh scheduling.
- Pro users receive standard refresh scheduling.
- Repeated saves update the same pending job instead of creating multiple scoring jobs.
- Due jobs are processed by a cron-ready scoring runner.

This provides a more production-ready balance between responsiveness and cost control.

---

### Subscription-Aware Product Logic

OppScore supports Free, Pro, and Premium plans.

#### Free

Free users can browse the opportunity database and save limited opportunities.

#### Pro

Pro users receive:

- Profile-based matching for up to two opportunity categories
- Standard competitiveness ranking
- Deadline tracking
- Effort-to-reward insight
- Gap reports

#### Premium

Premium users receive:

- Profile-based matching across all opportunity categories
- Expanded competitiveness ranking
- Faster updates for new and renewed opportunities
- Deadline tracking
- Effort-to-reward insight
- More gap reports

Subscription rules are enforced across the profile form, scoring route, dashboard, opportunity pages, and gap report generation.

---

### Opportunity Dashboard

The dashboard gives users a high-level view of their opportunity activity, including:

- Scored opportunities
- Gap reports
- Upcoming deadlines for saved opportunities
- Top scored opportunities
- Opportunities that may need stronger positioning

Only current competitiveness scores are shown to users.

---

### Admin Review Workflow

OppScore includes admin workflows for reviewing and managing opportunities.

Admins can:

- Review extracted opportunity drafts
- Approve or reject opportunities
- View extraction/scanning logs
- Run profile intelligence tools
- Run due scoring jobs manually during testing
- Monitor opportunity scoring behavior

The admin system is designed to support a future scraping and review pipeline.

---

### Cron-Ready Background Processing

OppScore includes a cron-ready route for automated scoring job processing:

```text
/api/cron/run-scoring-jobs
