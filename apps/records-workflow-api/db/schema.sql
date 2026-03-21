create extension if not exists pgcrypto;

create table if not exists hospital_systems (
  id uuid primary key default gen_random_uuid(),
  system_name text not null,
  canonical_domain text,
  state char(2) not null default 'TX',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table hospital_systems
  drop constraint if exists hospital_systems_system_name_key;
create unique index if not exists hospital_systems_unique_name_state
  on hospital_systems (system_name, state);

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

create table if not exists workflow_instructions (
  id uuid primary key default gen_random_uuid(),
  records_workflow_id uuid not null references records_workflows(id) on delete cascade,
  instruction_kind text not null check (
    instruction_kind in ('step', 'requirement', 'submission_channel', 'special_case', 'turnaround', 'note')
  ),
  sequence_no int not null default 0,
  label text,
  channel text check (
    channel in ('portal', 'online_request', 'fax', 'email', 'mail', 'phone', 'in_person', 'other')
  ),
  value text,
  details text not null,
  created_at timestamptz not null default now()
);

create index if not exists workflow_instructions_lookup
  on workflow_instructions (records_workflow_id, sequence_no);

create table if not exists source_documents (
  id uuid primary key default gen_random_uuid(),
  hospital_system_id uuid references hospital_systems(id),
  facility_id uuid references facilities(id),
  source_url text not null,
  source_page_url text,
  source_type text not null check (source_type in ('html', 'pdf')),
  title text,
  fetched_at timestamptz not null,
  http_status int,
  content_hash text,
  storage_path text,
  extracted_text text,
  parser_version text,
  import_mode text not null default 'crawl',
  import_notes text,
  created_at timestamptz not null default now()
);

alter table source_documents
  add column if not exists source_page_url text;

alter table source_documents
  add column if not exists import_mode text not null default 'crawl';

alter table source_documents
  add column if not exists import_notes text;

update source_documents
set source_page_url = source_url
where source_page_url is null
  and source_type = 'html';

with latest_workflow_runs as (
  select distinct on (er.source_document_id)
    er.source_document_id,
    er.structured_output->'metadata'->'sourceContext'->>'sourceUrl' as source_page_url
  from extraction_runs er
  where er.extractor_name = 'workflow_extractor'
  order by er.source_document_id, er.created_at desc
)
update source_documents sd
set source_page_url = latest_workflow_runs.source_page_url
from latest_workflow_runs
where sd.id = latest_workflow_runs.source_document_id
  and sd.source_page_url is null
  and coalesce(latest_workflow_runs.source_page_url, '') <> '';

with workflow_source_pages as (
  select distinct on (sd.id)
    sd.id as source_document_id,
    rw.official_page_url as source_page_url
  from source_documents sd
  join workflow_forms wf
    on wf.form_url = sd.source_url
  join records_workflows rw
    on rw.id = wf.records_workflow_id
  where sd.source_page_url is null
    and sd.source_type = 'pdf'
  order by sd.id, rw.updated_at desc nulls last, rw.created_at desc
)
update source_documents sd
set source_page_url = workflow_source_pages.source_page_url
from workflow_source_pages
where sd.id = workflow_source_pages.source_document_id
  and sd.source_page_url is null
  and coalesce(workflow_source_pages.source_page_url, '') <> '';

drop index if exists source_documents_unique_fetch;

create unique index if not exists source_documents_unique_fetch
  on source_documents (hospital_system_id, source_url, content_hash);

create table if not exists extraction_runs (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references source_documents(id) on delete cascade,
  extractor_name text not null,
  extractor_version text not null,
  status text not null check (status in ('success', 'partial', 'failed')),
  structured_output jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists pdf_question_templates (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null unique references source_documents(id) on delete cascade,
  latest_extraction_run_id uuid references extraction_runs(id) on delete set null,
  status text not null check (status in ('draft', 'approved', 'stale', 'unsupported')),
  payload jsonb not null,
  source_document_content_hash text,
  confidence_summary jsonb,
  review_notes text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pdf_question_template_versions (
  id uuid primary key default gen_random_uuid(),
  pdf_question_template_id uuid not null references pdf_question_templates(id) on delete cascade,
  source_document_id uuid not null references source_documents(id) on delete cascade,
  source_document_content_hash text,
  version_no int not null,
  status text not null check (status in ('approved', 'unsupported', 'stale')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz not null default now()
);

create unique index if not exists pdf_question_template_versions_unique_version
  on pdf_question_template_versions (pdf_question_template_id, version_no);

create index if not exists pdf_question_template_versions_source_document_lookup
  on pdf_question_template_versions (source_document_id, published_at desc);

create table if not exists seed_urls (
  id uuid primary key default gen_random_uuid(),
  hospital_system_id uuid not null references hospital_systems(id),
  facility_id uuid references facilities(id),
  url text not null,
  seed_type text not null check (
    seed_type in ('system_records_page', 'facility_records_page', 'portal_page', 'forms_page', 'directory_page')
  ),
  active boolean not null default true,
  approved_by_human boolean not null default false,
  evidence_note text,
  created_at timestamptz not null default now()
);

alter table seed_urls
  add column if not exists approved_by_human boolean not null default false;

alter table seed_urls
  add column if not exists evidence_note text;

alter table seed_urls
  drop constraint if exists seed_urls_url_key;

create unique index if not exists seed_urls_unique_system_url
  on seed_urls (hospital_system_id, url);

alter table workflow_forms
  add column if not exists published_question_template_version_id uuid references pdf_question_template_versions(id);

create table if not exists pipeline_run_history (
  id uuid primary key default gen_random_uuid(),
  state char(2),
  hospital_system_id uuid references hospital_systems(id) on delete set null,
  system_name text,
  run_scope text not null check (run_scope in ('system')),
  status text not null check (status in ('ok', 'no_seeds', 'failed')),
  crawled int not null default 0,
  extracted int not null default 0,
  failed int not null default 0,
  systems int not null default 0,
  crawl_summary jsonb not null default '{}'::jsonb,
  before_snapshot jsonb,
  after_snapshot jsonb,
  change_summary jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_run_history_state_created_lookup
  on pipeline_run_history (state, created_at desc);

create index if not exists pipeline_run_history_system_created_lookup
  on pipeline_run_history (hospital_system_id, created_at desc);
