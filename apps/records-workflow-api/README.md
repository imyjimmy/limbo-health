# Records Workflow API

Postgres-backed crawler + extraction service that ingests public hospital records pages and linked forms, normalizes portal/request workflows, and exposes facility-level read APIs.

## What this service implements

- Canonical Postgres schema for:
  - `hospital_systems`, `facilities`, `portal_profiles`, `records_workflows`
  - `workflow_contacts`, `workflow_forms`
  - `source_documents`, `extraction_runs`, `seed_urls`
- State-scoped seed registries such as `seeds/texas-systems.json` and `seeds/massachusetts-systems.json`
- Fetch + parse pipeline for HTML and PDF
- Deterministic extraction logic for:
  - portal detection and scope (`full`, `most_records`, `partial`, `unclear`, `none`)
  - formal-request classification
  - request method flags (online/portal/email/fax/mail/phone/in-person)
  - imaging/billing/amendment sub-workflows
- Read/admin endpoints:
  - `GET /api/records-workflow/hospital-systems`
  - `GET /api/records-workflow/facilities/search?q=...`
  - `GET /api/records-workflow/facilities/:facility_id/records-workflow`
  - `GET /api/records-workflow/hospital-systems/:id/records-workflows`
  - `GET /api/records-workflow/hospital-systems/:id/records-request-packet`
  - `GET /api/records-workflow/source-documents/:id/content`
  - `POST /internal/crawl/run`
  - `POST /internal/crawl/reseed`
  - `GET /internal/extraction-runs/:id`

## Data Acquisition Pipeline

```text
data/[state-prefixed files]
=> src/services/stateDataMaterializationService.js
   (Stage 1 "Data Intake": scans data/ for state-prefixed files, can use OpenAI to normalize non-homologous source files into hospital identities, writes run artifacts to storage/data-intake/<state>, merges the result into the canonical state seed file, and can reseed the DB)
=> seeds/[state-name]-systems.json
   (canonical seed registry; each JSON entry has:
    - system_name
    - state
    - domain
    - seed_urls[]
    - optional facilities[] with:
      - facility_name
      - city
      - state
      - facility_type
      - facility_page_url
      - external_facility_id)
=> src/services/seedService.js via src/seed.js
   (reads the canonical seed file and upserts hospital_systems, facilities, and seed_urls into Postgres)
=> src/services/crawlService.js via src/crawl.js
   (loads active DB seeds by hospital system and runs the crawl queue)
=> src/crawler/fetcher.js
   (fetches each URL and decides whether it is HTML or PDF; fetch artifacts are written under storage/fetch/<state>/...)
=> src/parsers/htmlParser.js or src/parsers/pdfParser.js
   (HTML: extracts title, body text, links, and nearby link context; PDF: extracts text, header lines, and metadata; parsed artifacts are written under storage/parsed/<state>/...)
=> src/crawler/linkExpander.js + src/utils/urls.js
   (scores pages and links to decide which ones look like medical-records workflow pages or medical-records PDFs and should be followed)
=> src/extractors/workflowExtractor.js
   (turns parsed pages/docs into structured workflow data such as portal info, request methods, forms, contacts, and instructions; downstream artifacts are written under storage/triage, storage/workflows, storage/questions, and storage/published)
=> src/utils/pdfStorage.js + src/utils/pdfNaming.js + src/utils/pdfHeader.js + src/utils/sourceDocumentStorage.js
   (for accepted PDFs: builds the final readable filename from the facility/system name, descriptive phrase, and language code, then writes it into the canonical source-document state folder)
=> storage/source-documents/[state]/[facility-or-system]-[descriptive-phrase]-[language][-N].pdf
```

Short version: `data -> canonical seeds -> DB reseed -> crawl/fetch/parse -> link expansion -> workflow extraction -> accepted PDFs in storage/source-documents/<state>/`.

## Setup

1. Create a Postgres database.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Install dependencies:
   - `npm install`
4. Apply schema:
   - `npm run migrate`
5. Seed systems/URLs:
   - `npm run seed`
   - Massachusetts only: `npm run seed -- --state MA`
   - Explicit file override: `npm run seed -- --seed-file seeds/massachusetts-systems.json`
6. Crawl:
   - `npm run crawl`
   - Massachusetts only: `npm run crawl -- --state MA`
   - Single system within a state: `npm run crawl -- --state MA --system-name "Tufts Medicine"`
7. Reset crawl-derived state for a single state before a clean recrawl:
   - Massachusetts only: `npm run reset:crawl-state -- --state MA --include-derived`
8. Remove stale crawl artifacts without wiping current data:
   - Preview: `npm run cleanup:stale-crawl:dry-run`
   - Apply: `npm run cleanup:stale-crawl`
9. Repartition existing raw PDFs into state subdirectories:
   - Preview: `npm run repartition:raw-storage-state`
   - Apply: `npm run repartition:raw-storage-state -- --apply`
10. Run API:
   - `npm run start`
11. Build the official CMS national hospital roster and compare processed states against it:
   - Build roster: `npm run build:national-roster`
   - Audit states currently represented under the legacy raw-state footprint in `storage/raw/*`: `npm run report:national-roster-coverage`
12. Generate import-compatible seed candidates from the CMS roster:
   - Single state: `npm run generate:seed-candidates -- --state CT`
   - Remaining states: `npm run generate:seed-candidates -- --all-remaining`
13. Import only high-confidence generated seeds:
   - Single state: `npm run import:generated-seeds -- --state CT`
   - Remaining states: `npm run import:generated-seeds -- --all-remaining`
14. Run the continuous nationwide rollout:
   - Single state: `npm run crawl:rollout -- --state CT`
   - Remaining states: `npm run crawl:rollout -- --all-remaining`

## Local Operator Console

For this machine, use the local convenience scripts instead of retyping env vars:

1. Install Python deps into the preferred local interpreter:
   - `npm run python:deps:install:local`
2. Verify the runtime that Scrapling and PyMuPDF will use:
   - `npm run python:deps:verify:local`
3. Apply the schema against the local Postgres container on `localhost:5433`:
   - `npm run migrate:local`
4. Start the API on `http://localhost:3020`:
   - `npm run start:local`

These local scripts default to:
- `DATABASE_URL=postgres://postgres:postgres@localhost:5433/records_workflow`
- `PORT=3020`
- `RECORDS_FETCH_BACKEND=scrapling`
- `RECORDS_PYTHON_BIN=/opt/homebrew/Caskroom/miniconda/base/bin/python3` when that interpreter exists
- `RECORDS_FETCH_PYTHON_BIN` matching `RECORDS_PYTHON_BIN`

If you want a different interpreter or port, pass the env var explicitly, for example:
- `PORT=3021 npm run start:local`
- `RECORDS_PYTHON_BIN=/custom/python3 npm run python:deps:verify:local`

## Storage Contract

`seeds/` and `storage/` serve different roles:

- `seeds/<state-name>-systems.json` is the canonical registry for hospital systems and their seed URLs.
- The database is the runtime materialization of the canonical seed registry plus extracted downstream state.
- `storage/` holds artifacts, blobs, and derived outputs produced by the pipeline.
- Nothing in `storage/` should silently override `seeds/`. A storage artifact only changes canonical seeds when an explicit promotion/materialization step writes back into `seeds/`.

### Canonical vs artifact

- Canonical seed definitions: `seeds/<state-name>-systems.json`
- Canonical accepted PDF blobs: `storage/source-documents/<state>/`
- Legacy/fallback PDF/blob location: `storage/raw/<state>/`
- Stage artifacts and caches: most other `storage/*` subdirectories

### Directory meanings

- `storage/data-intake/<state>`: Stage 1 data-intake run artifacts. These document how `data/*` was interpreted and whether canonical seeds were updated.
- `storage/generated-seeds/`: generated seed candidates from the roster/search pipeline. These are not canonical until explicitly promoted into `seeds/<state-name>-systems.json`.
- `storage/seed-scopes/<state>`: seed-scope stage artifacts and run metadata.
- `storage/fetch/<state>/<run-id>`: fetched HTML/PDF artifacts and crawl-stage metadata for a run.
- `storage/parsed/<state>`: parsed page/document artifacts derived from fetched content.
- `storage/triage/<state>`: triage/acceptance artifacts derived from parsed content.
- `storage/source-documents/<state>`: canonical home for accepted, live, DB-backed source documents, especially PDFs.
- `storage/raw/<state>`: legacy/raw storage. Keep for backward compatibility and old artifacts, but do not treat it as the intended finished corpus for accepted PDFs.
- `storage/workflows/<state>/<source-document-id>`: extracted workflow artifacts.
- `storage/questions/<state>/<source-document-id>`: question-extraction artifacts and drafts.
- `storage/published/<state>/<source-document-id>`: published downstream artifacts.

### What can be deleted or regenerated

- Usually safe to regenerate from upstream state: `storage/data-intake`, `storage/generated-seeds`, `storage/seed-scopes`, `storage/fetch`, `storage/parsed`, `storage/triage`, `storage/workflows`, `storage/questions`
- Not safe to treat as disposable: `seeds/` and `storage/source-documents/`
- Conditionally safe to clean: `storage/raw/`
  Only after confirming active DB-backed `source_documents.storage_path` rows no longer depend on it and canonical copies exist under `storage/source-documents/`
- Conditionally safe to clean: `storage/published/`
  Only if you are deliberately republishing or rebuilding those outputs

## Notes

- Accepted source-document PDFs now live canonically under `storage/source-documents/<state>/`.
- `storage/raw/<state>/` remains a legacy/fallback location for older artifacts and backward-compatible reads. Do not assume the newest accepted PDFs will land there.
- `CRAWL_STATE` scopes default crawl runs when no explicit CLI/API state is provided. Deployed Texas scheduled crawls should set `CRAWL_STATE=TX`.
- No-arg seeding remains Texas-oriented for backward compatibility. Use `--state` or `--seed-file` for non-Texas imports.
- Accepted medical-records request PDFs use descriptive filenames derived from the facility/system name, a sensible form phrase, and a language code.
- If a PDF generates an overly long filename, the naming pipeline now automatically falls back to a shorter semantic title derived from the PDF title/header before failing the rename step.
- `npm run reset:crawl-state -- --state MA --include-derived` performs a clean, state-scoped reset of crawl-derived Massachusetts data without touching Texas seeds or data.
- `npm run repartition:raw-storage-state -- --apply` performs a one-time move of existing PDF artifacts into state subdirectories and updates `source_documents.storage_path` without refetching anything.
- `npm run build:national-roster` writes a CMS-based active-hospital roster to `data/national-roster/cms-pos-q4-2025-active-hospitals.json`.
- `npm run report:national-roster-coverage` currently compares the legacy raw-state footprint against the official roster and writes a phase-1 audit report to `logs/reports/<date>-national-roster-audit.json`.
- `npm run generate:seed-candidates` writes generated seed files to `storage/generated-seeds/<state>-systems.generated.json` and includes `discovery_confidence` plus evidence metadata without breaking the existing seed schema.
- `npm run import:generated-seeds` promotes only high-confidence generated seed entries into the canonical `seeds/<state>-systems.json` file, then reseeds the DB from disk.
- `npm run crawl:rollout` generates candidates, promotes high-confidence entries into canonical seeds, reseeds the DB from disk, crawls by state, audits coverage, appends to a cumulative report, and keeps going even when a state lands in `not_ready`.
- The nationwide `--all-remaining` rollout scope now means the 50 U.S. states only; `DC` is intentionally excluded from automatic generate/import/crawl rollout targets.
- Use `npm run cleanup:stale-crawl` to discard superseded `source_documents`, old `extraction_runs`, and orphaned raw files from earlier crawl attempts.
- Do not use table truncation for routine crawl maintenance unless you explicitly want a full reset.
- Crawler depth defaults to `2` and only follows workflow-relevant links.
- Facility-level workflows override system-level workflows at read time.
- Browser automation/login flows are intentionally out of scope.

## Tests

Extractor fixtures cover Texas baselines plus Massachusetts portal-first, multi-channel, and PDF-heavy workflows:

- `npm test`
