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
8. run initial PDF question extraction
9. expand more candidate links from HTML

The important design flaw is not just "the code is large." The flaw is that most stage boundaries are still in memory only.

As a result:

- rejected PDFs are skipped and deleted instead of being reviewable artifacts
- crawled HTML is parsed, but the raw HTML snapshot is not durably stored as a stage artifact
- workflow extraction cannot be rerun cleanly from a persisted parsed-document stage
- link discovery cannot be replayed cleanly from stored HTML
- the dashboard cannot offer honest stage buttons beyond crawl, question extraction, and full pipeline

---

## 2. Core Design Goal

Refactor the records pipeline so every distinct stage has:

- a durable artifact boundary on disk
- a corresponding DB record
- a stage run record with status and counts
- enough provenance to rerun that stage without redoing earlier stages

The target outcome is:

```text
seed scope
=> fetch
=> triage
=> accepted source document storage
=> parse
=> workflow extraction
=> question extraction
=> review / publish
```

Each stage should be inspectable, repeatable, and attributable.

---

## 3. Key Naming Correction

`storage/raw` is misnamed.

It is not truly "raw fetch output." It currently behaves more like:

- accepted PDF source-document storage
- human-readable canonical filenames
- a reviewable corpus used by downstream parsing and question extraction

That means the honest rename is:

```text
storage/raw
=> storage/source-documents
```

Then add new stage-specific directories for artifacts that are actually raw or intermediate.

---

## 4. Proposed Storage Tree

Root:

```text
apps/records-workflow-api/storage/
  seed-scopes/
  fetch/
  triage/
  source-documents/
  parsed/
  workflows/
  questions/
  published/
```

Detailed tree:

```text
apps/records-workflow-api/storage/
  seed-scopes/
    tx/
      <pipeline-stage-run-id>.json

  fetch/
    tx/
      <fetch-artifact-id>/
        response.html
        response.pdf
        metadata.json

  triage/
    tx/
      <triage-decision-id>.json

  source-documents/
    tx/
      <system-or-facility>-<descriptive-phrase>-<language>[-N].html
      <system-or-facility>-<descriptive-phrase>-<language>[-N].pdf

  parsed/
    tx/
      <parsed-artifact-id>.json

  workflows/
    tx/
      <source-document-id>/
        <extraction-run-id>.json

  questions/
    tx/
      <source-document-id>/
        <extraction-run-id>.json

  published/
    tx/
      <source-document-id>/
        v1.json
        v2.json
```

### 4.1 Stage Semantics

- `seed-scopes/`
  - exact inputs for one targeted run
  - selected system, facility, seed URLs, options

- `fetch/`
  - immutable fetched body plus fetch metadata
  - this is the true raw stage

- `triage/`
  - one classification decision per fetched artifact
  - accepted, skipped, or needs review

- `source-documents/`
  - accepted canonical document corpus
  - this replaces current `storage/raw`

- `parsed/`
  - normalized HTML/PDF payloads used for reruns
  - links, contacts, headings, PDF geometry, parse status

- `workflows/`
  - workflow extraction output snapshots

- `questions/`
  - PDF question extraction output snapshots

- `published/`
  - app-consumable approved template versions

### 4.2 File Naming Rules

- `fetch/` should be keyed by artifact IDs, not pretty filenames
  - it is a provenance layer, not an operator-facing corpus
- `source-documents/` should keep the current human-readable naming style
  - this is the operator-facing accepted corpus
- `parsed/`, `workflows/`, and `questions/` should be keyed by IDs
  - they are machine-managed stage outputs

---

## 5. Stage Model

### 5.1 Stage List

The pipeline should be split into these explicit stages:

1. `seed_scope`
2. `fetch`
3. `triage`
4. `source_document_acceptance`
5. `parse`
6. `workflow_extraction`
7. `question_extraction`
8. `review_publish`

### 5.2 Why There Is An Acceptance Stage

The dashboard currently combines "PDF Parse and Storage" into one visible operator checkpoint.

Under the hood, we still need one explicit acceptance boundary:

- `fetch` artifact is the raw response
- `triage` decides whether it is allowed downstream
- `source_document_acceptance` copies the accepted artifact into canonical `source-documents/`
- `parse` creates the normalized machine-readable payload from the accepted source document

That distinction matters because:

- skipped documents must still be reviewable
- accepted documents need stable canonical paths
- parse reruns should operate on accepted source documents, not transient fetch blobs

### 5.3 Stage Contracts

| Stage | Reads | Writes | Can Rerun Without Refetch? |
| --- | --- | --- | --- |
| `seed_scope` | `seed_urls`, manual approvals | `seed-scopes/`, stage run row | yes |
| `fetch` | seed scope artifact | `fetch/`, fetch tables | no |
| `triage` | fetch artifact, context | `triage/`, triage table | yes |
| `source_document_acceptance` | accepted triage decision, fetch artifact | `source-documents/`, `source_documents` row | yes |
| `parse` | accepted source document | `parsed/`, parsed table | yes |
| `workflow_extraction` | parsed artifact | `workflows/`, existing workflow tables, `extraction_runs` | yes |
| `question_extraction` | parsed PDF artifact or accepted PDF source doc | `questions/`, `extraction_runs`, `pdf_question_templates` | yes |
| `review_publish` | question draft + PDF geometry | `published/`, `pdf_question_template_versions` | yes |

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
      'source_document_acceptance',
      'parse',
      'workflow_extraction',
      'question_extraction',
      'review_publish'
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
- let workflow extraction and question extraction replay from parsed artifacts

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
  - writes `pipeline_stage_runs` + `seed-scopes/`

- `runFetchStage({ seedScopeStageRunId, maxDepth })`
  - writes `crawl_frontier_items` + `fetch_artifacts`

- `runTriageStage({ fetchStageRunId })`
  - writes `triage_decisions`

- `runSourceDocumentAcceptanceStage({ triageStageRunId })`
  - copies accepted artifacts into `storage/source-documents/`
  - creates or updates `source_documents`

- `runParseStage({ sourceDocumentIds | acceptanceStageRunId })`
  - writes `parsed_artifacts`

- `runWorkflowExtractionStage({ sourceDocumentIds | parseStageRunId })`
  - consumes `parsed_artifacts`
  - writes `extraction_runs`, `records_workflows`, related workflow tables, and `workflows/`

- `runQuestionExtractionStage({ sourceDocumentIds | parseStageRunId })`
  - consumes parsed PDF artifacts
  - writes `extraction_runs`, `pdf_question_templates`, and `questions/`

- `runFullPipelineForSystem(...)`
  - orchestrates the stages above

### 7.3 What `runCrawl` Becomes

`runCrawl` should stop being "the implementation of every middle stage."

It should become:

```text
runSeedScopeStage
=> runFetchStage
=> runTriageStage
=> runSourceDocumentAcceptanceStage
=> runParseStage
=> runWorkflowExtractionStage
=> optionally runQuestionExtractionStage for accepted PDFs
```

The service can still expose one convenience entrypoint named `runCrawl`, but it should only orchestrate stage services.

---

## 8. Dashboard / API Implications

Once the schema above exists, the Pipeline UI can expose honest stage actions:

- `Run Seed Stage`
- `Run Fetch Stage`
- `Run Triage Stage`
- `Run Parse Stage`
- `Run Workflow Stage`
- `Run Question Stage`

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
fetch + triage + acceptance + parse + workflow extraction
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
- keep current behavior intact

### Phase 2: Stop Treating `storage/raw` As Raw

- create `storage/source-documents/`
- update helpers so accepted canonical PDFs/HTML write there
- keep a compatibility reader for legacy `storage/raw/`
- migrate path resolution helpers to accept both roots during transition

### Phase 3: Split `runCrawl`

- factor stage services out of `crawlService.js`
- keep `runCrawl` as orchestration only
- persist stage outputs as they are produced

### Phase 4: Split Dashboard Actions

- add stage endpoints
- make Pipeline buttons stage-specific
- show stage-run history and artifact inspection

### Phase 5: Human Rescue Paths

- add triage override UI
- add "accept skipped PDF" workflow
- add HTML/PDF reparsing and workflow re-extraction actions

---

## 10. Immediate Minimum Viable Refactor

If full schema rollout is too much at once, the smallest change set that still unlocks honest stage reruns is:

1. rename `storage/raw` semantics to `storage/source-documents`
2. persist crawled HTML snapshots to disk, not just manual HTML imports
3. add `source_page_url` to `source_documents`
4. add `parsed_artifacts`
5. split out:
   - `runParseStage`
   - `runWorkflowExtractionStage`
   - `runQuestionExtractionStage`
6. stop deleting skipped PDFs and store their triage decisions

This would be enough to make:

- parse reruns
- workflow reruns
- question reruns
- source-page tracing

work correctly, even before a full fetch-frontier refactor lands.

---

## 11. Acceptance Criteria

This spec is satisfied when all of the following are true:

- every pipeline stage writes a durable artifact or summary row
- the operator can rerun parse, workflow extraction, and question extraction without refetching
- the operator can see which page a PDF came from via `source_page_url`
- skipped PDFs are reviewable instead of disappearing
- crawled HTML is durably stored and replayable
- the dashboard’s stage buttons correspond to real backend stage entrypoints
- `runCrawl` is orchestration, not the only place middle-stage logic lives

---

## 12. Recommended Next Build Order

Build in this order:

1. `source_page_url` provenance on `source_documents`
2. crawled HTML snapshot persistence
3. `parsed_artifacts` table and storage
4. `runParseStage`
5. `runWorkflowExtractionStage`
6. `runQuestionExtractionStage` using parsed artifacts
7. skipped-document persistence via `triage_decisions`
8. fetch-frontier persistence

That order gives the dashboard honest rerun controls early, without waiting for the full frontier model.
