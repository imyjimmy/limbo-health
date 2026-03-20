# Human-Assisted Crawler Console Plan

## Goal

Build a simple operator UI for `records-workflow-api` that lets a human help the crawler when hospital sites block automated access or when the crawl needs manual approval and correction.

The point is not to replace the current crawler. The point is to give the existing pipeline a first-class human-assisted path for:

- adding and reviewing state seed targets
- pasting official records URLs reached manually
- uploading or attaching saved HTML pages
- uploading or attaching downloaded PDFs
- running the downstream normalization steps
- kicking off targeted recrawls
- reviewing failures and weak states

## Why This Is Needed

The current automated pipeline works well once it has a good seed file and accessible public pages. It struggles in two recurring cases:

1. Public hospital pages are bot-protected.
2. The crawler finds partial workflow data, but a human can quickly navigate to the real records page or direct PDF.

In those cases, the human should be able to supply the missing source material and let the system handle the structured ingestion and storage.

## Existing Pipeline

Today the pipeline is:

```text
data/[state].[html|txt|xlsx]
=> seed generation / editing
=> seeds/[state]-systems.json
=> seedService.js
=> crawlService.js
=> fetcher.js
=> htmlParser.js | pdfParser.js
=> linkExpander.js + urls.js
=> workflowExtractor.js
=> source_documents + extraction_runs + workflow tables
=> storage/raw/[state]/[facility-or-system]-[descriptive-phrase]-[language][-N].pdf
```

The operator console should sit on top of this pipeline, not replace it.

## Product Scope

### In Scope

- state dashboard and system-level crawl status
- seed review and editing
- manual entry of official records URLs
- manual upload/import of saved HTML pages
- manual upload/import of downloaded PDFs
- targeted reseed and targeted recrawl actions
- review queue for failures, skipped docs, hash-named files, and zero-PDF systems
- source document inspection

### Out of Scope

- browser automation to defeat bot protection
- automatic login flows
- full workflow editing in the browser
- complex version-control UI for seed files
- replacing Postgres or the existing extraction pipeline

## Operator Workflows

### 1. Seed Review

Operator chooses a state and sees:

- current `seeds/[state]-systems.json`
- number of systems
- number of facilities
- number of active seed URLs
- systems with `0` PDFs

Operator can:

- add a system
- remove a system
- add or remove a seed URL
- add facility rows
- mark a seed as homepage, records page, forms page, or portal page

Output:

- updated `seeds/[state]-systems.json`

### 2. Manual URL Assist

Operator reaches an official records page in a normal browser and pastes:

- system
- optional facility
- official page URL
- optional direct PDF URL
- notes

System should:

- create or update the seed URL
- optionally create a one-off crawl task for that URL
- preserve the URL as human-approved evidence

Output:

- updated DB seed rows
- optional update to `seeds/[state]-systems.json`

### 3. Manual HTML Import

Operator uploads or points to a saved HTML file from `data/`.

System should:

- parse the HTML with `htmlParser.js`
- run `workflowExtractor.js`
- insert a `source_documents` row of type `html`
- create an `extraction_runs` row
- upsert workflows, contacts, forms, and portal info

Output:

- a normal DB-backed workflow page, but sourced from trusted local HTML

### 4. Manual PDF Import

Operator uploads or points to a downloaded PDF already placed in `storage/raw/[state]/`.

System should:

- accept a source URL or a human-supplied origin note
- attempt normal PDF parsing
- if parsing succeeds, use the existing naming path
- if parsing fails, still allow import using trusted HTML/title/context
- rename the file into the canonical storage format
- insert a `source_documents` row of type `pdf`
- create an `extraction_runs` row, even if status is `partial`

Output:

- readable PDF filename in `storage/raw/[state]/`
- DB row attached to the right system/facility

### 5. Targeted Recrawl

Operator chooses:

- one system
- one facility
- one seed URL
- all zero-PDF systems in a state

System should run the existing crawl path only for that scope.

### 6. Review Queue

Operator should be able to quickly review:

- crawl failures
- skipped non-medical-records PDFs
- PDF parse failures
- long-name collisions
- hash-named leftovers
- systems with HTML but no PDFs
- systems with manual imports but no recrawl yet

## Proposed UI

### Page 1: State Dashboard

Per state:

- seeded systems
- facilities
- source documents
- PDF count
- workflows
- last crawl date
- number of zero-PDF systems
- number of failures

Actions:

- open seed review
- reseed state
- crawl state
- crawl zero-PDF systems
- open review queue

### Page 2: Seed Review

For one state:

- table of systems
- domain
- seed URLs
- facilities
- notes/evidence

Actions:

- add/edit/delete system
- add/edit/delete facility
- add/edit/delete seed URL
- save back to JSON
- reseed DB

### Page 3: System Detail

For one system:

- canonical domain
- facilities
- source documents
- PDFs on disk
- workflows extracted
- failures
- manual evidence entries

Actions:

- add manual URL
- import saved HTML
- import local PDF
- run targeted crawl

### Page 4: Manual Import

Tabs:

- import HTML
- import PDF
- add approved URL

Fields:

- state
- system
- optional facility
- source URL
- local file path or upload
- title override
- notes
- category override, if needed

### Page 5: Review Queue

Buckets:

- parse failures
- access denied / bot-protected
- zero-PDF systems
- suspicious filenames
- duplicate forms
- partial workflows

## Backend Additions

### New API Endpoints

- `GET /internal/states/:state/summary`
- `GET /internal/states/:state/systems`
- `GET /internal/states/:state/review-queue`
- `POST /internal/seeds/save`
- `POST /internal/manual-url`
- `POST /internal/manual-import/html`
- `POST /internal/manual-import/pdf`
- `POST /internal/crawl/system`
- `POST /internal/crawl/zero-pdf-systems`

### Service Modules

- `manualImportService.js`
  - import saved HTML into the existing extraction path
  - import local PDFs into the existing storage/DB path

- `reviewQueueService.js`
  - aggregate failures and weak states into operator-facing buckets

- `stateSummaryService.js`
  - state metrics for the dashboard

- `seedEditorService.js`
  - read/write `seeds/[state]-systems.json`
  - validate the seed schema before save

## Data Model Additions

These should be minimal.

### Candidate Additions

- `source_documents.import_mode`
  - values like `crawl`, `manual_html`, `manual_pdf`

- `source_documents.import_notes`
  - human note or provenance

- `seed_urls.approved_by_human`
  - boolean

- `seed_urls.evidence_note`
  - freeform note about why the seed is trusted

These are optional. The MVP can launch without schema changes if provenance is stored in `extraction_runs.structured_output.metadata`.

## Rules For Manual PDF Imports

Manual imports should follow these rules:

- a parse failure must not block ingestion
- file naming still uses the canonical storage format
- the source URL should be preserved whenever known
- human-supplied HTML/page context can be used as semantic context for naming and categorization
- manual language hints from the filename are hints, not absolute truth

## Approval Model

The simplest approval flow is:

1. Draft seed edit or manual import
2. Review diff/preview
3. Approve
4. Execute reseed/import/crawl

No multi-user workflow is needed yet.

## Suggested Phases

### Phase 1: Operator MVP

- state dashboard
- seed review page
- manual HTML import
- manual PDF import
- targeted recrawl button

This is the minimum version that helps with UW, MultiCare, Virginia Mason, and similar blocked/manual cases.

### Phase 2: Review and Repair

- review queue
- suspicious filename repair UI
- hash-named file repair UI
- PDF parse failure review

### Phase 3: Better Guidance

- recommend next targets based on zero-PDF systems
- show system prominence priority
- show state completeness trend over time

## Frontend Shape

Keep it simple.

- a small React or Next.js internal operator app is enough
- do not over-design this
- emphasize tables, filters, status chips, and action buttons
- open local raw PDFs directly from the UI when possible

## Risks

- seed editing and DB reseeding can drift if JSON and DB updates are not clearly synchronized
- manual imports can create duplicates if source URL and content hash matching are weak
- operators may accidentally attach a document to the wrong system or facility

## Mitigations

- always preview before save/import
- show system/facility identity clearly
- dedupe on `hospital_system_id + source_url + content_hash`
- keep import provenance in metadata
- make recrawls targeted and state-scoped

## Acceptance Criteria

- an operator can take a blocked public records page reached manually and get its HTML/PDF into the DB without shell work
- an operator can reseed a state without editing JSON in a text editor
- an operator can trigger a targeted recrawl for a single system
- an operator can see which systems still have `0` PDFs and why
- the resulting files still land in `storage/raw/[state]/...pdf` using the canonical naming scheme

## Recommended First Target

Build the MVP around Washington state, because it already demonstrates all of the important cases:

- bot-protected systems
- manual HTML assists
- manual PDF imports
- zero-PDF high-impact systems
- naming corrections
- targeted recrawls after manual intervention
