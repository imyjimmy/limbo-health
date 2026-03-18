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
  - `GET /v1/facilities/search?q=...`
  - `GET /v1/facilities/:facility_id/records-workflow`
  - `GET /v1/hospital-systems/:id/records-workflows`
  - `POST /internal/crawl/run`
  - `POST /internal/crawl/reseed`
  - `GET /internal/extraction-runs/:id`

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
9. Run API:
   - `npm run start`

## Notes

- Raw HTML/PDF snapshots are stored under `storage/raw`.
- `CRAWL_STATE` scopes default crawl runs when no explicit CLI/API state is provided. Deployed Texas scheduled crawls should set `CRAWL_STATE=TX`.
- No-arg seeding remains Texas-oriented for backward compatibility. Use `--state` or `--seed-file` for non-Texas imports.
- Accepted medical-records request PDFs use descriptive filenames derived from the facility/system name, a sensible form phrase, and a language code.
- `npm run reset:crawl-state -- --state MA --include-derived` performs a clean, state-scoped reset of crawl-derived Massachusetts data without touching Texas seeds or data.
- Use `npm run cleanup:stale-crawl` to discard superseded `source_documents`, old `extraction_runs`, and orphaned raw files from earlier crawl attempts.
- Do not use table truncation for routine crawl maintenance unless you explicitly want a full reset.
- Crawler depth defaults to `2` and only follows workflow-relevant links.
- Facility-level workflows override system-level workflows at read time.
- Browser automation/login flows are intentionally out of scope.

## Tests

Extractor fixtures cover Texas baselines plus Massachusetts portal-first, multi-channel, and PDF-heavy workflows:

- `npm test`
