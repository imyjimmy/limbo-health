# Modular Records Pipeline Storage And Stage Spec

**Project:** `records-workflow-api` modular crawl and extraction pipeline
**Date:** March 21, 2026
**Status:** Proposed refactor spec

---

## 1. Problem Summary

The current operator dashboard now shows the real failure points inside `runCrawl`, but the backend still does most of that work inside one coupled service call.

That mismatch creates a product problem:

- the Pipeline UI can explain where the crawl breaks
- the operator cannot rerun most of those checkpoints independently
- the system does not persist enough artifacts between stages to make those stages truly rerunnable

Today `runCrawl` still performs all of this in one loop:

1. pick active seeds
2. fetch a URL
3. decide whether a PDF is a real medical-records-request document
4. assign canonical PDF storage
5. parse HTML or PDF
6. extract workflow rows
7. save accepted source documents
8. run initial PDF question mapping
9. expand more candidate links from HTML

The important design flaw is not just "the code is large." The flaw is that most stage boundaries are still in memory only.

As a result:

- rejected PDFs are skipped and deleted instead of being reviewable artifacts
- crawled HTML is parsed, but the raw HTML snapshot is not durably stored as a stage artifact
- hospital-submission-requirements cannot be rerun cleanly from a persisted parsed-document stage
- link discovery cannot be replayed cleanly from stored HTML
- the dashboard cannot offer honest stage buttons beyond crawl, question mapping, and full pipeline

---

## 2. Core Design Goal

Refactor the records pipeline so the operator can understand it through durable human-facing artifacts, while the backend still keeps enough provenance to rerun machine sub-stages safely.

Every distinct stage should have:

- a durable artifact boundary on disk
- a corresponding DB record
- a stage run record with status and counts
- enough provenance to rerun that stage without redoing earlier stages

The human-facing target outcome is:

```text
data
=> seeds
=> targeted pages
=> captured forms
=> accepted forms
=> parsed pdf
=> question mapping
=> published template
```

`hospital-submission-requirements` is a derived artifact that can come from:

- the targeted page
- the accepted form
- or both together

So it should be persisted, but it should not be forced into a fake single linear step if the evidence is coming from multiple artifacts.

Each artifact boundary should be inspectable, repeatable, and attributable.

---

## 3. Human Model Vs Machine Model

The current repo leaks machine-stage vocabulary into the operator experience.

That is why the system feels harder to understand than it should.

There are really two layers here:

### 3.1 Human-Facing Artifact Model

```text
data
=> seeds
=> targeted pages
=> captured forms
=> accepted forms
=> parsed pdf
=> question mapping
=> published template
```

Plus a side artifact:

```text
targeted pages and/or accepted forms
=> hospital-submission-requirements
```

### 3.2 Internal Machine Sub-Stages

The backend may still need sub-stages such as:

- `seed_scope`
- `fetch`
- `triage`
- `acceptance`
- `parse`
- `hospital_submission_requirements`
- `question_mapping`
- `publish_template`

Those machine labels are implementation details.

The operator dashboard and `storage/` layout should primarily reflect the human artifact model, not the machine bookkeeping.

---

## 4. Proposed Storage Tree

Root:

```text
apps/records-workflow-api/storage/
  targeted-pages/
  captured-forms/
  accepted-forms/
  parsed/
  hospital-submission-requirements/
  question-mappings/
  published-templates/
  internal/
    seed-scopes/
    triage-decisions/
```

Detailed tree:

```text
apps/records-workflow-api/storage/
  targeted-pages/
    tx/
      <targeted-page-artifact-id>/
        response.html
        response.pdf
        metadata.json

  captured-forms/
    tx/
      <captured-form-id>/
        source.pdf
        metadata.json

  accepted-forms/
    tx/
      <system-or-facility>-<descriptive-phrase>-<language>[-N].html
      <system-or-facility>-<descriptive-phrase>-<language>[-N].pdf

  parsed/
    tx/
      <parsed-artifact-id>.json

  hospital-submission-requirements/
    tx/
      <source-document-id>/
        <extraction-run-id>.json

  question-mappings/
    tx/
      <source-document-id>/
        <extraction-run-id>.json

  published-templates/
    tx/
      <source-document-id>/
        v1.json
        v2.json

  internal/
    seed-scopes/
      tx/
        <pipeline-stage-run-id>.json

    triage-decisions/
      tx/
        <triage-decision-id>.json
```

### 4.1 Stage Semantics

- `targeted-pages/`
  - the page snapshots and fetch artifacts a human can inspect when fixing where the crawler should look
  - this is the discovery layer

- `captured-forms/`
  - plausible request forms before they are promoted into the trusted corpus
  - this is the review queue humans should be able to inspect

- `accepted-forms/`
  - canonical approved document corpus
  - this replaces both `storage/raw` and `storage/source-documents` as the honest primary name

- `parsed/`
  - normalized HTML/PDF payloads used for reruns
  - links, contacts, headings, PDF geometry, parse status

- `hospital-submission-requirements/`
  - submission requirements derived from targeted pages and/or accepted forms
  - this is the human-facing replacement for backend-speak like `workflow-extraction`

- `question-mappings/`
  - PDF question-mapping output snapshots
  - saved questions, bindings, and repairable mapping drafts

- `published-templates/`
  - app-consumable approved template versions

- `internal/`
  - machine bookkeeping only
  - this is where seed-scope and triage metadata should live so they do not dominate the top-level artifact story

### 4.2 File Naming Rules

- `targeted-pages/` should be keyed by artifact IDs, not pretty filenames
  - it is a provenance layer, not an operator-facing corpus
- `captured-forms/` can be keyed by IDs during review
- `accepted-forms/` should keep the current human-readable naming style
  - this is the operator-facing accepted corpus
- `parsed/`, `hospital-submission-requirements/`, and `question-mappings/` should be keyed by IDs
  - they are machine-managed stage outputs

---

## 5. Stage Model

### 5.1 Human-Facing Artifact Stages

The operator should experience the pipeline as:

1. `data`
2. `seeds`
3. `targeted_pages`
4. `captured_forms`
5. `accepted_forms`
6. `parsed_pdf`
7. `hospital_submission_requirements`
8. `question_mapping`
9. `published_template`

### 5.2 Why There Are Still Internal Sub-Stages

The backend still needs machine checkpoints such as fetch, triage, and acceptance because the system must distinguish:

- what it looked at
- what it thinks is relevant
- what a human has accepted into the trusted corpus

Those sub-stages should remain inspectable, but they should not be the primary top-level explanation of the system.

### 5.3 Internal Stage Contracts

| Internal Stage | Reads | Writes | Can Rerun Without Refetch? |
| --- | --- | --- | --- |
| `seed_scope` | `seed_urls`, manual approvals | `storage/internal/seed-scopes/`, stage run row | yes |
| `fetch` | seed scope artifact | `storage/targeted-pages/`, fetch tables | no |
| `triage` | targeted-page artifact, context | `storage/internal/triage-decisions/`, triage table | yes |
| `acceptance` | accepted triage decision, targeted-page artifact | `storage/captured-forms/` and/or `storage/accepted-forms/`, `source_documents` row | yes |
| `parse` | accepted form | `storage/parsed/`, parsed table | yes |
| `hospital_submission_requirements` | parsed artifact, targeted pages, accepted forms | `storage/hospital-submission-requirements/`, existing workflow tables, `extraction_runs` | yes |
| `question_mapping` | parsed PDF artifact or accepted PDF source doc | `storage/question-mappings/`, `extraction_runs`, `pdf_question_templates` | yes |
| `publish_template` | question draft + PDF geometry | `storage/published-templates/`, `pdf_question_template_versions` | yes |

---

## 6. Proposed Database Schema

This spec intentionally keeps the existing domain tables:

- `hospital_systems`
- `facilities`
- `seed_urls`
- `source_documents`
- `extraction_runs`
- `records_workflows`
- `portal_profiles`
- `pdf_question_templates`
- `pdf_question_template_versions`
- `pipeline_run_history`

The modular refactor adds stage/provenance tables around them.

## 6.1 New Top-Level Stage Table

```sql
create table if not exists pipeline_stage_runs (
  id uuid primary key default gen_random_uuid(),
  pipeline_run_history_id uuid references pipeline_run_history(id) on delete set null,
  parent_stage_run_id uuid references pipeline_stage_runs(id) on delete set null,
  stage_key text not null check (
    stage_key in (
      'seed_scope',
      'fetch',
      'triage',
      'acceptance',
      'parse',
      'hospital_submission_requirements',
      'question_mapping',
      'publish_template'
    )
  ),
  state char(2),
  hospital_system_id uuid references hospital_systems(id) on delete set null,
  facility_id uuid references facilities(id) on delete set null,
  status text not null check (
    status in (
      'queued',
      'running',
      'ok',
      'partial',
      'needs_review',
      'skipped',
      'failed',
      'no_input'
    )
  ),
  input_count int not null default 0,
  output_count int not null default 0,
  failed_count int not null default 0,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_stage_runs_lookup
  on pipeline_stage_runs (hospital_system_id, stage_key, created_at desc);
```

Purpose:

- one row per actual stage invocation
- gives the UI a true stage-level status model
- lets the operator see "last successful parse stage" separately from "last crawl stage"

## 6.2 Fetch Frontier Table

```sql
create table if not exists crawl_frontier_items (
  id uuid primary key default gen_random_uuid(),
  fetch_stage_run_id uuid not null references pipeline_stage_runs(id) on delete cascade,
  hospital_system_id uuid not null references hospital_systems(id) on delete cascade,
  facility_id uuid references facilities(id) on delete set null,
  seed_url_id uuid references seed_urls(id) on delete set null,
  discovered_from_item_id uuid references crawl_frontier_items(id) on delete set null,
  original_url text not null,
  normalized_url text not null,
  final_url text,
  depth int not null default 0,
  queue_status text not null check (
    queue_status in ('queued', 'fetched', 'accepted', 'skipped', 'failed')
  ),
  source_context jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crawl_frontier_items_stage_lookup
  on crawl_frontier_items (fetch_stage_run_id, queue_status, depth, created_at);

create index if not exists crawl_frontier_items_system_url_lookup
  on crawl_frontier_items (hospital_system_id, normalized_url);
```

Purpose:

- persist the crawl queue
- persist discovery provenance
- make fetch/discovery replayable and inspectable

## 6.3 Fetch Artifact Table

```sql
create table if not exists fetch_artifacts (
  id uuid primary key default gen_random_uuid(),
  crawl_frontier_item_id uuid not null references crawl_frontier_items(id) on delete cascade,
  fetch_stage_run_id uuid not null references pipeline_stage_runs(id) on delete cascade,
  requested_url text not null,
  final_url text,
  http_status int,
  content_type text,
  source_type text check (source_type in ('html', 'pdf', 'other')),
  content_hash text,
  response_bytes int,
  fetch_backend text,
  storage_path text not null,
  headers jsonb,
  fetch_metadata jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists fetch_artifacts_stage_lookup
  on fetch_artifacts (fetch_stage_run_id, fetched_at desc);

create index if not exists fetch_artifacts_hash_lookup
  on fetch_artifacts (content_hash);
```

Purpose:

- durable raw fetch artifact
- enough metadata to troubleshoot fetch failures, redirects, and duplicate content

## 6.4 Triage Decision Table

```sql
create table if not exists triage_decisions (
  id uuid primary key default gen_random_uuid(),
  triage_stage_run_id uuid not null references pipeline_stage_runs(id) on delete cascade,
  fetch_artifact_id uuid not null references fetch_artifacts(id) on delete cascade,
  decision text not null check (
    decision in ('accepted', 'skipped', 'needs_review')
  ),
  basis text,
  reason_code text,
  reason_detail text,
  classifier_name text not null,
  classifier_version text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists triage_decisions_fetch_lookup
  on triage_decisions (fetch_artifact_id, created_at desc);
```

Purpose:

- preserve skipped and ambiguous documents
- support future human override on misclassified PDFs

## 6.5 Parsed Artifact Table

```sql
create table if not exists parsed_artifacts (
  id uuid primary key default gen_random_uuid(),
  parse_stage_run_id uuid not null references pipeline_stage_runs(id) on delete cascade,
  fetch_artifact_id uuid references fetch_artifacts(id) on delete set null,
  source_document_id uuid references source_documents(id) on delete set null,
  source_type text not null check (source_type in ('html', 'pdf')),
  parser_name text not null,
  parser_version text not null,
  parse_status text not null check (parse_status in ('success', 'empty_text', 'failed')),
  storage_path text not null,
  extracted_text text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists parsed_artifacts_source_document_lookup
  on parsed_artifacts (source_document_id, created_at desc);
```

Purpose:

- make parse a first-class rerunnable stage
- store normalized HTML/PDF payloads durably
- let hospital-submission-requirements and question-mapping replay from parsed artifacts

## 6.6 `source_documents` Additive Columns

`source_documents` should remain the canonical accepted document table, but it needs stronger provenance.

Add:

```sql
alter table source_documents
  add column if not exists accepted_stage_run_id uuid references pipeline_stage_runs(id);

alter table source_documents
  add column if not exists fetch_artifact_id uuid references fetch_artifacts(id);

alter table source_documents
  add column if not exists triage_decision_id uuid references triage_decisions(id);

alter table source_documents
  add column if not exists parsed_artifact_id uuid references parsed_artifacts(id);

alter table source_documents
  add column if not exists source_page_url text;

alter table source_documents
  add column if not exists discovered_from_url text;
```

Purpose:

- track exactly which page led to a PDF or HTML source doc
- solve the "where did this PDF come from?" problem at the data layer
- link accepted source documents back to fetch, triage, and parse artifacts

`source_page_url` is the most important new column for the operator dashboard.

## 6.7 Keep Using `extraction_runs`

Do not replace `extraction_runs`.

It already works for:

- `workflow_extractor`
- `pdf_form_understanding_openai`

Keep it as the extraction ledger, but make those runs consume persisted `parsed_artifacts` instead of ad hoc in-memory parser results.

## 6.8 Optional Future Table For Human Triage Overrides

Not required in phase 1, but likely useful:

```sql
create table if not exists triage_overrides (
  id uuid primary key default gen_random_uuid(),
  triage_decision_id uuid not null references triage_decisions(id) on delete cascade,
  override_decision text not null check (
    override_decision in ('accepted', 'skipped', 'needs_review')
  ),
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);
```

This would let an operator rescue a misclassified PDF without refetching it.

---

## 7. Stage Module Refactor

`runCrawl` should become a thin orchestration layer that calls explicit stage services.

### 7.1 New Service Split

```text
src/services/pipeline/
  seedScopeStageService.js
  fetchStageService.js
  triageStageService.js
  sourceDocumentAcceptanceStageService.js
  parseStageService.js
  workflowExtractionStageService.js
  questionExtractionStageService.js
  reviewPublishStageService.js
  pipelineOrchestratorService.js
```

### 7.2 Proposed Service Contracts

- `runSeedScopeStage({ state, systemId, facilityId, seedUrl })`
  - reads `seed_urls`
  - writes `pipeline_stage_runs` + `storage/internal/seed-scopes/`

- `runFetchStage({ seedScopeStageRunId, maxDepth })`
  - writes `crawl_frontier_items` + `fetch_artifacts`
  - persists targeted-page artifacts under `storage/targeted-pages/`

- `runTriageStage({ fetchStageRunId })`
  - writes `triage_decisions`
  - persists machine-only triage summaries under `storage/internal/triage-decisions/`

- `runAcceptanceStage({ triageStageRunId })`
  - copies accepted artifacts into `storage/accepted-forms/`
  - creates or updates `source_documents`

- `runParseStage({ sourceDocumentIds | acceptanceStageRunId })`
  - writes `parsed_artifacts`

- `runHospitalSubmissionRequirementsStage({ sourceDocumentIds | parseStageRunId })`
  - consumes `parsed_artifacts`
  - writes `extraction_runs`, `records_workflows`, related workflow tables, and `storage/hospital-submission-requirements/`

- `runQuestionMappingStage({ sourceDocumentIds | parseStageRunId })`
  - consumes parsed PDF artifacts
  - writes `extraction_runs`, `pdf_question_templates`, and `storage/question-mappings/`

- `runFullPipelineForSystem(...)`
  - orchestrates the stages above

### 7.3 What `runCrawl` Becomes

`runCrawl` should stop being "the implementation of every middle stage."

It should become:

```text
runSeedScopeStage
=> runFetchStage
=> runTriageStage
=> runAcceptanceStage
=> runParseStage
=> runHospitalSubmissionRequirementsStage
=> optionally runQuestionMappingStage for accepted PDFs
```

The service can still expose one convenience entrypoint named `runCrawl`, but it should only orchestrate stage services.

---

## 8. Dashboard / API Implications

Once the schema above exists, the Pipeline UI can expose honest artifact actions:

- `Run Targeted Pages`
- `Review Captured Forms`
- `Promote Accepted Forms`
- `Run Parse`
- `Refresh Hospital Submission Requirements`
- `Refresh Question Mapping`

And each stage card can show:

- last stage run status
- input artifact count
- output artifact count
- failures
- skip counts
- review-needed counts

### 8.1 Proposed Internal Endpoints

```text
POST /internal/pipeline/system/seed-scope
POST /internal/pipeline/system/fetch
POST /internal/pipeline/system/triage
POST /internal/pipeline/system/accept
POST /internal/pipeline/system/parse
POST /internal/pipeline/system/workflows
POST /internal/pipeline/system/questions
POST /internal/pipeline/system/full
GET  /internal/pipeline/stage-runs?system_id=...&stage_key=...
GET  /internal/fetch-artifacts/:id
GET  /internal/triage-decisions/:id
GET  /internal/parsed-artifacts/:id
```

The current `Run Crawl Stage` button can later become a convenience action that runs:

```text
targeted pages + captured forms + accepted forms + parse + hospital-submission-requirements
```

But the UI would no longer be forced to pretend that is the only available control.

---

## 9. Migration Plan

### Phase 1: Introduce Storage And Provenance

- add new storage directories
- add `pipeline_stage_runs`
- add `crawl_frontier_items`
- add `fetch_artifacts`
- add `triage_decisions`
- add `parsed_artifacts`
- add provenance columns to `source_documents`
- keep current behavior intact while moving machine bookkeeping under `storage/internal/`

### Phase 2: Rename The Corpus Honestly

- create `storage/accepted-forms/`
- update helpers so accepted canonical PDFs/HTML write there
- keep compatibility readers for legacy `storage/source-documents/` and `storage/raw/`
- migrate path resolution helpers to accept both roots during transition

### Phase 3: Promote Human-Facing Artifact Names

- rename top-level artifact directories to:
  - `targeted-pages/`
  - `captured-forms/`
  - `accepted-forms/`
  - `hospital-submission-requirements/`
  - `question-mappings/`
  - `published-templates/`
- keep machine-only state under `storage/internal/`

### Phase 4: Split `runCrawl`

- factor stage services out of `crawlService.js`
- keep `runCrawl` as orchestration only
- persist stage outputs as they are produced

### Phase 5: Split Dashboard Actions

- add stage endpoints
- make Pipeline buttons stage-specific
- show stage-run history and artifact inspection

### Phase 6: Human Rescue Paths

- add triage override UI
- add "accept skipped PDF" workflow
- add HTML/PDF reparsing and workflow re-extraction actions

---

## 10. Immediate Minimum Viable Refactor

If full schema rollout is too much at once, the smallest change set that still unlocks honest stage reruns is:

1. rename the accepted corpus to `storage/accepted-forms`
2. persist targeted-page snapshots to disk, not just manual HTML imports
3. add `source_page_url` to `source_documents`
4. add `parsed_artifacts`
5. split out:
   - `runParseStage`
   - `runHospitalSubmissionRequirementsStage`
   - `runQuestionMappingStage`
6. stop deleting skipped PDFs and store their triage decisions

This would be enough to make:

- parse reruns
- hospital-submission-requirements reruns
- question-mapping reruns
- source-page tracing

work correctly, even before a full fetch-frontier refactor lands.

---

## 11. Acceptance Criteria

This spec is satisfied when all of the following are true:

- every pipeline stage writes a durable artifact or summary row
- the operator can rerun parse, hospital-submission-requirements, and question-mapping without refetching
- the operator can see which page a PDF came from via `source_page_url`
- skipped PDFs are reviewable instead of disappearing
- crawled HTML is durably stored and replayable
- the dashboard’s stage buttons correspond to real backend stage entrypoints
- `runCrawl` is orchestration, not the only place middle-stage logic lives

---

## 12. Recommended Next Build Order

Build in this order:

1. `source_page_url` provenance on `source_documents`
2. targeted-page snapshot persistence
3. `parsed_artifacts` table and storage
4. `runParseStage`
5. `runHospitalSubmissionRequirementsStage`
6. `runQuestionMappingStage` using parsed artifacts
7. skipped-document persistence via `triage_decisions`
8. fetch-frontier persistence

That order gives the dashboard honest rerun controls early, without waiting for the full frontier model.
