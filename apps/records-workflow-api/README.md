# Records Workflow API (Texas Medical Records)

Postgres-backed crawler + extraction service that ingests public hospital records pages and linked forms, normalizes portal/request workflows, and exposes facility-level read APIs.

## What this service implements

- Canonical Postgres schema for:
  - `hospital_systems`, `facilities`, `portal_profiles`, `records_workflows`
  - `workflow_contacts`, `workflow_forms`
  - `source_documents`, `extraction_runs`, `seed_urls`
- Seed registry from `seeds/texas-systems.json`
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
6. Crawl:
   - `npm run crawl`
7. Run API:
   - `npm run start`

## Notes

- Raw HTML/PDF snapshots are stored under `storage/raw` by content hash.
- Crawler depth defaults to `2` and only follows workflow-relevant links.
- Facility-level workflows override system-level workflows at read time.
- Browser automation/login flows are intentionally out of scope.

## Tests

Extractor fixture tests for Baylor, St. David's, Texas Health, UT Southwestern, Methodist, and Houston Methodist:

- `npm test`
