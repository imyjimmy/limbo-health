# PDF Form Understanding Throughput And Reliability Spec

**Project:** Records Workflow API PDF understanding pipeline
**Date:** March 20, 2026
**Status:** Required follow-up work before full-corpus rollout

---

## 1. Problem Summary

The PDF form-understanding pipeline is implemented, but the first real backfill attempt against the existing cached corpus failed at the operational layer. This is now a separate product and infrastructure problem from the core extraction logic and needs its own dedicated workstream.

The issue is not "can the code call OpenAI?" The issue is whether the system can reliably and affordably process the entire `storage/raw` corpus without exhausting rate limits, breaking strict structured outputs, or burning through a small API-credit budget.

As of March 20, 2026, the full forced rerun over tracked cached PDFs produced:

- `596` candidate PDFs
- `596` inserted PDF-understanding extraction runs
- `0` successful schemas
- `596` failed runs

Observed failure buckets from the rerun:

- `323` failures: `429 Request too large`
- `249` failures: `429 Rate limit reached`
- `24` failures: `400 Invalid schema for response_format`

This means the pipeline is not yet safe to run across the corpus, even though the underlying extraction path and React Native integration exist.

---

## 2. Why This Is Its Own Spec

This problem is broad enough to deserve separate design and acceptance criteria because it spans:

- prompt construction
- schema design for OpenAI Structured Outputs
- rate limiting and retry behavior
- cost control
- batch/backfill operations
- observability and audit reporting
- rollout strategy for existing and newly crawled PDFs

Without solving this layer, "automatic PDF understanding" is not production-ready in practice.

---

## 3. Current Known Constraints

### 3.1 Corpus Size

At the time of the failed rerun:

- `652` raw PDFs existed on disk under `apps/records-workflow-api/storage/raw`
- `596` tracked cached PDF `source_documents` existed in Postgres
- `59` raw PDFs on disk were orphaned and did not have matching tracked `source_documents`

### 3.2 Runtime Constraints

- Postgres is local and operational
- PyMuPDF is now installed and the parser produces page models successfully
- OpenAI credentials can be configured locally
- The current extraction model was configured as `gpt-4.1`

### 3.3 Rate-Limit Constraints

The first rerun revealed an org TPM ceiling of roughly `30,000` tokens for the configured model tier. The current prompt builder can exceed that ceiling for a single request, and the current backfill loop can also exceed that ceiling across sequential requests because it does not do token-aware pacing.

### 3.4 Cost Constraints

The intended operator may have a very small API-credit budget, for example `$10` in available credits. The system must therefore support:

- low-cost pilot runs
- up-front prompt budgeting
- projected spend before full-corpus execution
- stopping rules before runaway spend

---

## 4. Root Causes

### 4.1 Oversized Prompts

The current grounded PDF prompt is too large. It includes enough layout detail that many requests exceed the model's request/token-rate limits before inference can succeed.

This is the largest failure bucket and the most important operational blocker.

### 4.2 Missing Rate Limiting And Backoff

Even requests that fit under the per-request size ceiling still fail because the current backfill loop does not:

- estimate token usage before sending
- pace requests against the model's TPM budget
- retry with exponential backoff and jitter
- downgrade concurrency or pause after rate-limit responses

### 4.3 Invalid Strict JSON Schema

The current `response_format.json_schema` is not fully valid for strict structured outputs. Some object schemas define `properties` without listing all of those properties in `required`.

This causes hard `400` responses before model inference.

### 4.4 No Rollout Guardrails

The system currently lacks a safe operational path for:

- running a tiny pilot first
- computing estimated total cost before full backfill
- automatically aborting when failure rate is too high
- resuming partially completed backfills safely

---

## 5. Product Goal

Enable `records-workflow-api` to precompute high-confidence PDF question schemas and answer bindings for the existing cached corpus and for newly crawled PDFs in a way that is:

- reliable
- rate-limit aware
- cost-bounded
- resumable
- observable

The desired outcome is not just "some PDFs work." The desired outcome is a repeatable pipeline that can process the corpus, report exact coverage, and stay within practical cost and rate-limit constraints.

---

## 6. Non-Goals

This spec does not require:

- improving the semantic quality of question extraction beyond current schema goals
- expanding question types beyond `single_select`, `multi_select`, and `short_text`
- solving complex signatures, repeating tables, or freeform medical narratives
- changing the React Native UX beyond consuming the existing `autofill` metadata

Those may become future follow-up specs, but they are not the focus here.

---

## 7. Requirements

### 7.1 Prompt Budgeting

The pipeline must compute an estimated prompt-token count before making an OpenAI request.

Requirements:

- every request gets a preflight token estimate
- requests above a configured safe threshold are automatically trimmed before send
- the trim strategy is deterministic and logged
- the system exposes the final estimated token count per request in extraction metadata

### 7.2 Smaller Prompt Construction

The grounded page model sent to OpenAI must be aggressively reduced without losing the information required to identify form questions and answer targets.

Requirements:

- prioritize the most relevant pages instead of blindly sending the first N pages
- prioritize nearby text around widgets, checkboxes, radio groups, and lines
- deduplicate repeated boilerplate text and repeated headers/footers
- cap words, widgets, line candidates, and checkbox candidates per page using explicit limits
- support a second-pass retry profile if the first compact prompt returns low confidence

### 7.3 Strict Schema Validity

The OpenAI structured-output schema must be valid for strict mode.

Requirements:

- every object schema uses `additionalProperties: false`
- every property declared in `properties` is also declared in `required`
- optional semantics are represented via nullable fields or variant schemas
- binding schemas are modeled as strict variants, not one large partially required object
- there is a local schema-validation test suite that catches invalid response-format definitions before runtime

### 7.4 Rate Limiting And Retries

Backfill and crawl-triggered extraction must respect model rate limits.

Requirements:

- token-aware pacing against a configurable TPM budget
- exponential backoff with jitter on `429`
- retry classification that distinguishes `request too large`, `rate limit`, `schema invalid`, and transient upstream failures
- automatic suppression of retries for non-retryable `400` schema errors
- configurable per-run concurrency, defaulting to the safest setting

### 7.5 Cost Guardrails

The operator must be able to understand projected spend before a large run.

Requirements:

- a dry-run mode that estimates total input/output token usage for a candidate batch
- projected dollar-cost output before execution starts
- configurable maximum budget per run
- automatic stop when estimated or observed spend crosses the configured threshold
- support for low-cost pilot runs by state, by count, or by explicit PDF set

### 7.6 Observability

Operators must be able to see what happened without digging through raw DB rows manually.

Requirements:

- each extraction run records request-estimate metadata, retry count, prompt profile, and failure reason
- audits must report:
  - PDFs with `supported: true`
  - PDFs with no questions
  - PDFs with invalid or missing bindings
  - PDFs with no extraction run
  - PDFs skipped for prompt-budget reasons
  - PDFs that exhausted retries
- state-level and corpus-level summaries must be easy to generate

### 7.7 Safe Rollout

The system must support a staged rollout rather than one all-or-nothing corpus run.

Requirements:

- sample mode: run on `N` PDFs
- state mode: run on one state at a time
- resumable mode: skip already-successful runs unless forced
- promotion path from pilot -> one state -> several states -> full corpus
- documented exit criteria before expanding rollout scope

---

## 8. Proposed Solution Areas

### 8.1 Prompt Compaction Layer

Add a dedicated prompt-compaction stage between page-model extraction and model invocation.

This layer should:

- rank pages by form-likeness
- extract local neighborhoods around candidate controls
- compress long text into spatially grounded snippets
- remove decorative and repeated content
- emit a compact "question-candidate map" rather than the full raw page model

#### Fillable-Area-First Extraction

One especially promising optimization is to stop treating the whole PDF page as equally important.

Instead, the compaction layer should heavily prioritize areas that appear to be intended for user input, including:

- AcroForm widgets and their nearby labels
- checkbox and radio clusters
- underlines and boxed blanks
- short text regions immediately adjacent to phrases like:
  - `name`
  - `date of birth`
  - `records requested`
  - `type of records`
  - `signature`
  - `phone`
  - `address`

The extractor should prefer small, spatially local slices around those regions instead of dumping large contiguous page text into the prompt.

Expected advantages:

- lower prompt-token count
- higher signal-to-noise ratio
- better grounding between question text and answer target
- less spend on headers, legal boilerplate, and instructions that do not affect fill behavior

#### Heuristics For Detecting Fillable Areas

The compaction layer should treat the following as strong evidence that a region is meant for user input:

- true AcroForm fields exposed by the PDF parser
- repeated small square or circular marks aligned like checkbox or radio groups
- long horizontal lines or boxed blanks with short labels immediately to the left or above
- dense clusters of short words near marks or blank lines, especially labels that look like prompts
- phrases commonly used in release forms, including:
  - `type of records`
  - `records requested`
  - `purpose`
  - `date range`
  - `from`
  - `to`
  - `other`
  - `initial`
  - `check all that apply`
  - `circle one`

The extractor should build small coordinate windows around these regions, then keep only:

- the candidate control geometry
- the nearby label text
- page metadata required to write the answer back

It should explicitly avoid sending:

- full-page body text
- legal boilerplate blocks
- mailing instructions
- release-policy paragraphs
- repeated hospital branding, headers, and footers

#### Early Estimate Of Token Savings

An exploratory local sample on March 20, 2026 compared the current prompt shape to a rough fillable-area-first approximation over `20` cached PDFs.

Observed result from that sample:

- average current prompt size: about `83,266` characters
- average compact prompt size: about `16,245` characters
- average reduction: about `77.5%`
- median reduction: about `79.9%`

This was not a production implementation of the compaction layer, only a rough simulation, so it should not be treated as a guaranteed final number. But it strongly suggests that fillable-area-first extraction could reduce prompt size by roughly `60%` to `80%`, and possibly more on forms with large amounts of boilerplate text.

### 8.2 Strict Schema Refactor

Refactor the current OpenAI response schema into strict variant objects.

Preferred direction:

- top-level objects use fully required keys
- nullable fields represent optionality
- binding objects use `anyOf` across strict variants such as:
  - field text
  - field checkbox
  - field radio
  - overlay text
  - overlay mark

### 8.3 Token-Bucket Backfill Runner

The backfill command should become a token-aware runner rather than a simple sequential loop.

The runner should:

- estimate tokens before each request
- reserve against a local token bucket
- wait when the next request would overflow the current TPM window
- back off after `429`
- emit periodic progress snapshots

### 8.4 Cost-Aware Execution Modes

The operational CLI should support:

- `--dry-run`
- `--budget-usd`
- `--max-input-tokens`
- `--prompt-profile compact|expanded`
- `--retry-profile safe|standard|aggressive`

### 8.5 Audit And Coverage Reporting

After any pilot or real run, the system should generate a machine-readable and human-readable report that answers:

- what was attempted
- what succeeded
- what failed
- why it failed
- how much it likely cost
- whether the corpus is ready for React Native to depend on

### 8.6 Additional Optimization Ideas

The following optimization ideas should be evaluated during implementation:

- fillable-area-first extraction before any broader page summarization
- page ranking based on widget density, checkbox density, and blank-line density
- dropping repeated headers, footers, fax instructions, and mailing boilerplate
- field-neighborhood extraction that keeps only the label plus a bounded coordinate window around the answer target
- two-pass prompting:
  - first pass identifies likely question regions
  - second pass extracts only those regions into final structured questions
- model-tier split:
  - cheaper model for candidate-region narrowing
  - stronger model only for final schema generation
- cached deduplication for near-identical PDFs reused across hospital systems or languages
- stateful retry profiles that retry with a smaller prompt before declaring failure

---

## 9. Acceptance Criteria

The work in this spec is complete only when all of the following are true:

1. A pilot run of at least `10` cached PDFs completes without any strict-schema `400` failures.
2. A pilot run of at least `10` cached PDFs completes without any `429 Request too large` failures.
3. Rate-limit `429` responses, if they occur, are automatically retried with pacing and do not fail the entire run prematurely.
4. The system can produce a dry-run estimate for a full-corpus backfill before sending any OpenAI requests.
5. The system can enforce a run budget low enough for a small-credit account.
6. An audit report can be generated automatically after the run and includes support/no-question/binding coverage buckets.
7. A state-level backfill can complete successfully before full-corpus rollout is attempted.
8. The full-corpus rollout is not attempted until pilot and state-level runs meet success-rate targets defined by the rollout owner.

---

## 10. Open Questions

- Which model tier should be the default for production backfill: higher-quality default or lower-cost default?
- Should compact and expanded prompt profiles target different model tiers?
- Should newly crawled PDFs use the same online pipeline immediately, or should crawl-time extraction remain disabled until backfill reliability is proven?
- How should we prioritize PDFs that are most likely to matter for React Native autofill coverage first?
- Should orphaned raw PDFs be reconciled into `source_documents` before any large backfill is attempted?

---

## 11. Recommended Next Work Items

1. Fix the strict structured-output schema so all objects are valid in OpenAI strict mode.
2. Implement prompt-token estimation and expose it in extraction metadata.
3. Add a compact prompt profile that materially reduces the current request size.
4. Add token-aware pacing and retry/backoff to the backfill runner.
5. Add dry-run cost estimation and budget-stop controls.
6. Rerun a `5` to `10` PDF pilot and publish a new audit report.

---

## 12. Status Note

Until this spec is implemented, the automatic PDF-understanding feature should be considered code-complete but operationally unproven. React Native can consume `autofill` metadata when it exists, but the system is not yet ready to claim corpus-wide automatic question-schema coverage.
