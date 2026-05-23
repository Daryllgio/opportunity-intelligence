alter table opportunity_drafts
add column if not exists source_category text,
add column if not exists application_url_quality text,
add column if not exists review_flags text[] default '{}',
add column if not exists source_quality_reasons text[] default '{}',
add column if not exists official_source_url text,
add column if not exists official_source_verified boolean default false,
add column if not exists application_note text;

alter table opportunities
add column if not exists validation_score integer,
add column if not exists validation_decision text,
add column if not exists validation_reasons text[] default '{}',
add column if not exists duplicate_risk text,
add column if not exists source_trust text,
add column if not exists auto_publish_eligible boolean default false,
add column if not exists source_category text,
add column if not exists application_url_quality text,
add column if not exists review_flags text[] default '{}',
add column if not exists source_quality_reasons text[] default '{}',
add column if not exists official_source_url text,
add column if not exists official_source_verified boolean default false,
add column if not exists application_note text;
