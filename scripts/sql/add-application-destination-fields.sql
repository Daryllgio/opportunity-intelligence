alter table opportunity_drafts
add column if not exists application_destination_url text,
add column if not exists application_destination_type text,
add column if not exists official_source_status text,
add column if not exists destination_confidence text,
add column if not exists destination_reasons text[] default '{}',
add column if not exists application_document_url text,
add column if not exists application_document_type text;

alter table opportunities
add column if not exists application_destination_url text,
add column if not exists application_destination_type text,
add column if not exists official_source_status text,
add column if not exists destination_confidence text,
add column if not exists destination_reasons text[] default '{}',
add column if not exists application_document_url text,
add column if not exists application_document_type text;
