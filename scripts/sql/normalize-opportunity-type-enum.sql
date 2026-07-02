-- Normalize the opportunities.type enum to the canonical taxonomy.
--
-- The `opportunity_type` enum predates the taxonomy in
-- src/lib/discovery/taxonomy.ts and is missing three canonical values.
-- Without this migration, the pipeline cannot publish research_program /
-- career_development_program / pipeline_program opportunities (inserts fail
-- with: invalid input value for enum opportunity_type).
--
-- Apply in the Supabase SQL editor.
--
-- STEP 1 — run by itself first (new enum values cannot be used in the same
-- transaction that adds them):

ALTER TYPE opportunity_type ADD VALUE IF NOT EXISTS 'research_program';
ALTER TYPE opportunity_type ADD VALUE IF NOT EXISTS 'career_development_program';
ALTER TYPE opportunity_type ADD VALUE IF NOT EXISTS 'pipeline_program';

-- STEP 2 — run after step 1 has committed:

UPDATE opportunities
SET type = 'research_program', updated_at = NOW()
WHERE type = 'research';

-- Note: legacy enum values (research, funded_conference,
-- professional_development) intentionally remain in the enum — Postgres
-- cannot drop enum values — but no code writes them anymore.
