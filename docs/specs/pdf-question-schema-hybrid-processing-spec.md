# PDF Question Schema Hybrid Processing Spec

Status: Draft
Owner: Limbo Health
Last updated: 2026-04-03

## 1. Purpose

Define the architecture for the PDF-processing slice that starts after the correct PDF has already been acquired and ends just before question-schema generation begins.

This spec exists to reconcile two valid but incomplete approaches:

- the current Limbo path, which prefers native PDF structure extraction
- the article-style OCR-first path, which is more robust for scanned and flattened documents

The goal is not to replace the current parser with an OCR stack. The goal is to introduce a hybrid preprocessing layer that preserves native PDF semantics when they exist and falls back to OCR-derived layout when they do not.

## 2. Scope

In scope:

- input begins with a local PDF file path or PDF bytes that have already been selected as the correct source document
- PDF inspection, parsing, classification, routing, normalization, and validation
- optional rasterization and OCR fallback for weak native parses
- the normalized intermediate artifact handed to question-schema generation

Out of scope:

- seed discovery
- URL crawling
- fetch-stage acquisition logic
- document triage and acceptance
- LLM prompt throughput, rate limiting, or cost controls already covered by `pdf-form-understanding-throughput-spec.md`
- operator-side manual repair UX already covered by `operator-pdf-editor-repair-spec.md`
- downstream question-schema generation semantics beyond the handoff contract

## 3. Background

Today the question-schema pipeline is built on top of a native-PDF-first parser:

- `pdf_extract.py` extracts text, words, widgets, checkbox candidates, line candidates, and header lines via PyMuPDF
- `pdfParser.js` wraps that output into the parsed PDF artifact
- `pdfFormUnderstandingPrompt.js` compacts the parsed page model into a grounded prompt payload
- `pdfFormUnderstandingExtractor.js` invokes the model and repairs the returned schema

That current path is strong for fillable medical-record request PDFs because it preserves:

- true AcroForm field names
- widget coordinates
- native checkbox and line geometry
- direct write-back targets for autofill

However, the current path is weak when the PDF is:

- image-only
- flattened
- text-sparse despite visibly containing form content
- structurally damaged in ways that `qpdf` repair does not fix

The article-style OCR pipeline is stronger on those failure modes because it:

- renders pages to images
- can preprocess page images before recognition
- extracts text and layout even when the PDF has no usable text layer

But an OCR-first replacement would be a regression for native fillable PDFs because it would throw away:

- exact AcroForm field names
- native field types
- direct write-back bindings

## 4. Problem Summary

The current and article-style pipelines differ in the wrong dimension for our product if treated as mutually exclusive.

The real product need is:

- preserve native PDF semantics when they exist
- recover usable layout from scanned or flattened PDFs when they do not
- present one normalized pre-schema artifact to the question-schema generator

The gap is therefore not "we need DeepSeek-OCR everywhere."

The gap is:

- no explicit parser routing decision
- no OCR fallback path
- no merged native-plus-OCR intermediate representation
- no pre-schema validator that can decide whether the native parse is good enough to trust

## 5. Goals

This spec should produce a preprocessing layer that:

- keeps AcroForm-aware parsing as the default for native fillable PDFs
- adds OCR fallback for scanned and flattened PDFs
- unifies both paths behind one normalized document artifact
- makes routing decisions deterministic and inspectable
- blocks bad low-signal parses before question-schema generation starts
- preserves compatibility with the current `acroform` and `overlay` question-schema modes

## 6. Non-Goals

This spec does not require:

- replacing the existing question-schema model
- changing supported question kinds
- building a general-purpose document-intelligence platform
- solving every table-extraction problem
- choosing a single OCR vendor up front
- making crawl-stage or fetch-stage changes

## 7. Comparative Summary

| Dimension | Current Limbo Path | OCR-First Path | Required Hybrid Behavior |
| --- | --- | --- | --- |
| Primary signal | Native PDF structure | Rendered page images | Prefer native; fall back to OCR |
| AcroForm preservation | Strong | Lost unless separately extracted | Must preserve when present |
| Scanned PDF handling | Weak | Stronger | Must be strong |
| Direct write-back targets | Strong | Weak | Preserve native targets; use overlay targets otherwise |
| Determinism | Higher | Lower | Keep routing deterministic even if OCR backend is probabilistic |
| Cost | Lower on text PDFs | Higher | Spend OCR only where needed |
| Output shape | Existing page model | Varies by OCR tool | Normalize into one contract |

## 8. Core Design Principle

Question-schema generation should not care whether its upstream evidence came from:

- native PDF extraction
- OCR extraction
- a merged hybrid result

It should receive a single validated intermediate artifact with stable fields, stable confidence metadata, and explicit provenance.

## 9. Proposed Architecture

The preprocessing slice should become a five-step pipeline:

1. Native parse attempt
2. Parse-quality classification
3. Route selection
4. Optional OCR augmentation or fallback
5. Normalization and validation

The output of step 5 is the only artifact question-schema generation should consume.

## 10. Stage Definitions

### 10.1 Stage A: Native Parse Attempt

Every PDF should first go through the existing native parser.

Required behavior:

- keep current PyMuPDF extraction of:
  - document text
  - page words
  - widgets
  - line candidates
  - checkbox candidates
  - header lines
- keep `qpdf` repair retry for structurally damaged PDFs
- record parse metadata such as:
  - page count
  - widget count
  - word count
  - extracted-text length
  - parse status
  - repair attempted / repaired

This stage remains the system of record for native structure.

### 10.2 Stage B: Parse-Quality Classification

After native parsing, the system must score the PDF for schema-readiness.

The classifier must answer:

- is native parsing sufficient on its own?
- should OCR augment the native parse?
- should OCR replace the native parse for schema preparation?

At minimum, the classifier should evaluate:

- `parse_status`
- total extracted text length
- per-page word density
- widget count
- checkbox candidate count
- line candidate count
- fraction of pages with meaningful text
- mismatch between page count and pages with usable text

Recommended route buckets:

- `native_preferred`
  - strong text layer and/or meaningful widget coverage
- `hybrid_augment`
  - some useful native structure exists, but text coverage is weak or uneven
- `ocr_fallback`
  - native parse is failed, empty, or too weak for safe schema generation

The classifier must be deterministic and threshold-based, not LLM-based.

### 10.3 Stage C: OCR Augmentation Or Fallback

If the route is `hybrid_augment` or `ocr_fallback`, the system should render page images and run OCR.

This stage must be provider-agnostic.

Acceptable backend categories include:

- local OCR engines
- layout-aware OCR pipelines
- vision-language OCR systems such as DeepSeek-OCR
- managed document-AI services

The architecture must not hardcode one provider into the artifact contract.

Current implementation constraint:

- possession of OpenAI API credentials alone does not provide direct access to DeepSeek-OCR
- therefore the first implementation must not assume DeepSeek-OCR availability
- if only OpenAI credentials are available, the initial OCR-capable backend must be either:
  - an OpenAI vision model used for OCR-like extraction
- a local/self-hosted OCR stack
- another separately provisioned OCR provider
- DeepSeek-OCR remains a valid future backend once separate provider access or self-hosting exists

What "self-hosted DeepSeek-OCR" means in practice:

- the GitHub repository is not itself a managed OCR service
- the repository provides the runner code, configuration, and integration examples for model inference
- the model weights must still be obtained separately, for example from Hugging Face
- a compatible GPU runtime must still be provisioned
- CUDA, PyTorch, and either `vLLM` or `Transformers` must still be installed and working
- if Limbo wants to call DeepSeek-OCR from `records-workflow-api`, we would still need to wrap that runtime in an internal service or worker

Useful mental model:

- the repo is the installation kit and control wiring
- the model weights are the engine
- the GPU runtime is the machine the engine runs in
- our app integration is the dashboard and controls

This matters because "DeepSeek-OCR is open source" does not mean "DeepSeek-OCR is instantly available in our current environment."

Required OCR-stage behavior:

- rasterize PDF pages at a controlled resolution
- support retry at a higher resolution when first-pass OCR is too weak
- return page-level text and spatial regions
- expose OCR confidence where available
- preserve page index alignment with the native parse

Optional but recommended image preprocessing:

- rotation correction
- deskew
- contrast normalization
- denoising

These preprocessing steps should be configurable and only used when they improve weak-image PDFs, not as a mandatory cost on every document.

### 10.4 Stage D: Hybrid Normalization

Native and OCR outputs must be mapped into one normalized intermediate representation.

The normalized representation must preserve provenance for every field cluster so downstream logic can distinguish:

- native widget-backed evidence
- native text-layer evidence
- OCR-derived evidence

The normalized artifact should contain:

- document-level metadata
  - source document id
  - page count
  - route used
  - parse mode
  - native parse summary
  - OCR summary if present
- per-page content
  - `pageIndex`
  - page width and height
  - normalized words
  - normalized text blocks or label snippets
  - widgets when present
  - checkbox candidates
  - line candidates
  - provenance markers
- document-level validation flags

Rules:

- native widgets always win over OCR-implied widgets
- OCR text may supplement native words when native text is missing or sparse
- overlay-style geometry may be derived from OCR regions when no native fields exist
- the artifact must be explicit about whether the downstream schema generator should target:
  - `acroform`
  - `overlay`
  - `mixed evidence but single output mode chosen upstream`

### 10.5 Stage E: Pre-Schema Validation Gate

Before question-schema generation begins, the normalized artifact must pass a validation gate.

This gate should reject or flag documents where preprocessing still leaves the document too weak for reliable schema generation.

Required validations:

- document has at least one page
- at least one page has usable text or usable fillable geometry
- native route without OCR must not pass if the document is effectively empty
- OCR route must not pass if OCR output is blank or obviously repetitive
- when widgets exist, their coordinates and field names are retained
- when widgets do not exist, overlay-capable geometry exists for downstream binding

Recommended additional validations:

- repetition detector for duplicated OCR lines
- boilerplate dominance detector
- low-signal page detector
- per-page usable-evidence count

The validation gate should produce one of:

- `ready`
- `ready_with_warnings`
- `needs_review`
- `failed_pre_schema`

Only `ready` and `ready_with_warnings` should proceed automatically into question-schema generation.

## 11. Handoff Contract To Question-Schema Generation

Question-schema generation should consume a single new artifact, conceptually:

- `PreparedPdfForQuestionSchema`

This artifact must provide:

- stable document metadata
- selected parse route
- validated page evidence
- explicit downstream target mode hint:
  - `acroform`
  - `overlay`
- warnings and confidence summaries

Question-schema generation should not be responsible for:

- deciding whether OCR was needed
- reconciling native and OCR evidence
- deciding whether the source PDF is too weak to parse

Those decisions belong upstream in preprocessing.

## 12. Route-Specific Rules

### 12.1 Native-Preferred Route

Use when:

- AcroForm widgets exist and are meaningful
- or native text and geometry are already strong enough

Requirements:

- keep current parser output as the primary evidence source
- do not rasterize pages unless explicitly requested for augmentation
- preserve widget field names exactly
- prefer downstream `acroform` mode when supported

### 12.2 Hybrid-Augment Route

Use when:

- some native structure is valuable
- but text coverage is incomplete or suspicious

Requirements:

- keep native widgets and native geometry
- use OCR to fill text gaps and improve label recovery
- do not let OCR overwrite true widget identities
- allow downstream `acroform` mode if native bindings remain complete
- otherwise downgrade to `overlay` with explicit warning metadata

### 12.3 OCR-Fallback Route

Use when:

- native parse is failed, empty, or too sparse to trust

Requirements:

- render pages and run OCR
- normalize OCR output into overlay-friendly page evidence
- mark the artifact as `overlay`-only for downstream schema generation
- preserve the original native-parse failure metadata for auditability

## 13. Why OCR Should Be A Fallback, Not A Replacement

For Limbo's use case, image-first OCR is not the ideal default because many target PDFs are not generic scanned documents. They are hospital forms with real fillable fields.

Replacing the current parser with an OCR-only path would lose:

- exact field names
- field types
- direct write-back bindings
- some of the determinism of native geometry

Therefore:

- native parsing is the default path
- OCR is the recovery path
- hybrid merge is the bridge between the two

## 14. Functional Requirements

### 14.1 Artifact Compatibility

The new preprocessing artifact must be consumable by the existing question-schema system with minimal downstream changes.

### 14.2 Provenance

Every normalized page element must be attributable to one of:

- native text layer
- native widget layer
- OCR layer
- synthesized geometry derived from validated OCR evidence

### 14.3 Auditability

Operators must be able to inspect:

- which route was selected
- why that route was selected
- whether OCR was used
- whether OCR was retry-rendered at a different resolution
- what warnings blocked or downgraded the document

### 14.4 Deterministic Routing

Routing must be deterministic for the same PDF and same configuration.

### 14.5 Backward Safety

If OCR infrastructure is unavailable, the system must still be able to:

- run the native-preferred path
- flag weak documents as `needs_review`
- avoid silently pretending weak parses are good enough

## 15. Non-Functional Requirements

- preprocessing must be resumable per PDF
- OCR backend selection must be configurable
- page rendering resolution must be configurable
- intermediate artifacts must be serializable to disk for inspection
- failure modes must be explicit, not inferred from missing fields

## 16. Acceptance Criteria

This spec is satisfied when:

1. A fillable AcroForm PDF still produces native widget-backed evidence and reaches question-schema generation without forced OCR.
2. An image-only or flattened PDF can reach question-schema generation through the OCR route with overlay-capable evidence.
3. A mixed-quality PDF can preserve native widgets while gaining OCR-derived text support through the hybrid route.
4. Routing decisions are visible in persisted metadata.
5. Weak PDFs are blocked before schema generation instead of silently producing low-signal outputs.
6. Downstream question-schema generation receives one normalized artifact shape regardless of route.

## 17. Rollout Plan

Recommended rollout order:

1. Add parse-quality classification on top of the existing native parser.
2. Add `needs_review` gating for obviously weak native parses even before OCR exists.
3. Introduce OCR fallback behind a feature flag.
4. Add hybrid augmentation for partially useful native parses.
5. Switch question-schema generation to consume the normalized pre-schema artifact.
6. Measure coverage improvements on known scanned and flattened PDFs.

## 18. Primary Code Areas Likely To Change

- `/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/src/parsers/pdf_extract.py`
- `/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/src/parsers/pdfParser.js`
- `/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/src/utils/pdfFormUnderstandingPrompt.js`
- `/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/src/extractors/pdfFormUnderstandingExtractor.js`
- `/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/src/services/pipeline/parseStageService.js`
- any new OCR adapter and normalization modules added under `apps/records-workflow-api/src/`

## 19. Open Decisions

The following decisions are intentionally left open for implementation:

- which OCR backend should be used first
- whether OCR should be local, managed, or model-based
- what exact routing thresholds define `native_preferred`, `hybrid_augment`, and `ocr_fallback`
- whether OCR augmentation should operate on all pages or only low-signal pages
- whether OCR text blocks should be stored as words only, snippets only, or both

These are implementation choices. The architecture requirement is the hybrid contract, not a specific vendor.

Practical note:

- if the environment only has OpenAI API tokens, then DeepSeek-OCR cannot be the initial backend choice
- in that environment, the realistic first-step implementation is:
  - native parser first
  - OpenAI-vision fallback for weak PDFs
  - optional future migration to DeepSeek-OCR if separate access is added
- if Limbo later chooses self-hosted DeepSeek-OCR, that should be treated as a separate infrastructure project, not a small parser swap

## 20. Relationship To Existing Specs

This spec complements, rather than replaces:

- `pdf-form-understanding-throughput-spec.md`
  - covers cost, prompt sizing, retries, and operational rollout
- `operator-pdf-editor-repair-spec.md`
  - covers human repair after schema generation

This spec fills the missing design space between them:

- how raw acquired PDFs become validated pre-schema artifacts
- how native parsing and OCR should coexist
- how the system decides whether a PDF is good enough to send into question-schema generation
