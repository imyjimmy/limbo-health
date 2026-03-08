create extension if not exists pgcrypto;

create table if not exists hospital_systems (
  id uuid primary key default gen_random_uuid(),
  system_name text not null unique,
  canonical_domain text,
  state char(2) not null default 'TX',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  hospital_system_id uuid not null references hospital_systems(id),
  facility_name text not null,
  city text,
  state char(2) not null default 'TX',
  facility_type text,
  facility_page_url text,
  external_facility_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists facilities_unique_name_city_state
  on facilities (hospital_system_id, facility_name, coalesce(city, ''), state);

create table if not exists portal_profiles (
  id uuid primary key default gen_random_uuid(),
  hospital_system_id uuid references hospital_systems(id),
  facility_id uuid references facilities(id),
  portal_name text,
  portal_url text,
  portal_scope text not null check (
    portal_scope in ('full', 'most_records', 'partial', 'unclear', 'none')
  ),
  supports_signup boolean,
  supports_password_reset boolean,
  supports_record_download boolean,
  supports_formal_copy_request_in_portal boolean,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists records_workflows (
  id uuid primary key default gen_random_uuid(),
  hospital_system_id uuid references hospital_systems(id),
  facility_id uuid references facilities(id),
  workflow_type text not null check (
    workflow_type in ('medical_records', 'imaging', 'billing', 'amendment', 'other')
  ),
  official_page_url text not null,
  request_scope text not null check (
    request_scope in ('complete_chart', 'portal_records', 'mixed', 'imaging_only', 'billing_only', 'unclear')
  ),
  formal_request_required boolean,
  online_request_available boolean,
  portal_request_available boolean,
  email_available boolean,
  fax_available boolean,
  mail_available boolean,
  in_person_available boolean,
  phone_available boolean,
  turnaround_notes text,
  fee_notes text,
  special_instructions text,
  confidence text not null check (
    confidence in ('high', 'medium', 'low')
  ),
  last_verified_at timestamptz,
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists records_workflows_lookup
  on records_workflows (hospital_system_id, facility_id, workflow_type);

create table if not exists workflow_contacts (
  id uuid primary key default gen_random_uuid(),
  records_workflow_id uuid not null references records_workflows(id) on delete cascade,
  contact_type text not null check (
    contact_type in ('phone', 'fax', 'email', 'mailing_address', 'portal_url', 'online_request_url', 'other')
  ),
  label text,
  value text not null,
  created_at timestamptz not null default now()
);

create table if not exists workflow_forms (
  id uuid primary key default gen_random_uuid(),
  records_workflow_id uuid not null references records_workflows(id) on delete cascade,
  form_name text not null,
  form_url text not null,
  form_format text check (form_format in ('pdf', 'html', 'docusign', 'doc', 'other')),
  language text,
  required_for_request boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists source_documents (
  id uuid primary key default gen_random_uuid(),
  hospital_system_id uuid references hospital_systems(id),
  facility_id uuid references facilities(id),
  source_url text not null,
  source_type text not null check (source_type in ('html', 'pdf')),
  title text,
  fetched_at timestamptz not null,
  http_status int,
  content_hash text,
  storage_path text,
  extracted_text text,
  parser_version text,
  created_at timestamptz not null default now()
);

create unique index if not exists source_documents_unique_fetch
  on source_documents (source_url, content_hash);

create table if not exists extraction_runs (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references source_documents(id) on delete cascade,
  extractor_name text not null,
  extractor_version text not null,
  status text not null check (status in ('success', 'partial', 'failed')),
  structured_output jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists seed_urls (
  id uuid primary key default gen_random_uuid(),
  hospital_system_id uuid not null references hospital_systems(id),
  facility_id uuid references facilities(id),
  url text not null unique,
  seed_type text not null check (
    seed_type in ('system_records_page', 'facility_records_page', 'portal_page', 'forms_page', 'directory_page')
  ),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
