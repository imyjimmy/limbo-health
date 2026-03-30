# Records Workflow Explicit Scope Spec

Status: Draft
Owner: Limbo Health
Last updated: 2026-03-28

## 1. Purpose

Define a cleanup of the records-workflow data model so app logic no longer has to infer system-vs-facility scope from `facility_id is null`.

This spec is motivated by the St. David's HealthCare packet failure:

- the correct medical-records workflow was saved on the only real facility row
- an older stale workflow existed at the system level
- the system packet selector only considered `facility_id is null`
- the app therefore surfaced the wrong forms even though the correct PDF, parse, and schema already existed

The goal is to stop treating `null` as an overloaded business concept when the real concept is scope.

## 2. Problem Summary

Today the repo uses one-table models where a row may apply to:

- the whole hospital system
- one specific facility

That is currently encoded implicitly as:

- `facility_id is null` => system-scoped
- `facility_id is not null` => facility-scoped

That storage shortcut is compact, but it leaks into application behavior.

Examples:

- packet selection queries assume `facility_id is null` means "best system-wide answer"
- facility-aware fallbacks become ad hoc
- single-facility systems are awkward because their best workflow may live on the only facility row while the system packet still ignores it
- stale system-level rows are too easy to prefer over fresher facility rows

The issue is not that nullable foreign keys are inherently bad.

The issue is that `null` is being used as a hidden scope enum.

## 3. Goals

This change should:

- make scope explicit in the DB
- preserve the current one-table model
- keep `facility_id` as a real foreign key, not a magic flag
- make read-path ranking logic easier to reason about
- reduce bugs where stale system rows overshadow valid facility rows
- keep the packet-building and workflow-selection code honest

## 4. Non-Goals

This spec does not require:

- splitting `records_workflows` into separate system and facility tables
- rewriting every table in the records-workflow schema
- changing how the PDF editor stores mappings
- changing how the iOS app consumes packets
- immediate scope typing for every table with a nullable `facility_id`

The first pass should focus on the tables where scope ambiguity is currently causing real product bugs.

## 5. First-Pass Scope

Phase 1 should add explicit scope to:

- `records_workflows`
- `portal_profiles`

Why these first:

- they directly drive packet generation
- they currently rely on `facility_id is null` in selection logic
- they are the rows most likely to be interpreted as system defaults or facility overrides

Tables that may stay unchanged in Phase 1:

- `source_documents`
- `seed_urls`
- `parsed_artifacts`
- `workflow_forms`

Those tables can still carry nullable `facility_id` without forcing packet-selection semantics onto `null`.

## 6. Proposed Data Model

Add a new column:

- `scope_type text not null check (scope_type in ('system', 'facility'))`

To:

- `records_workflows`
- `portal_profiles`

Keep `facility_id` on both tables, but make its meaning constrained by `scope_type`.

### 6.1 Constraint Rules

For both tables:

- if `scope_type = 'system'`, then `facility_id must be null`
- if `scope_type = 'facility'`, then `facility_id must not be null`

That should be enforced with a DB check constraint rather than by convention alone.

### 6.2 Why Keep `facility_id` Nullable At All

Because the row may genuinely be system-scoped.

The improvement is not "ban null."
The improvement is "stop making null imply scope by itself."

With `scope_type`, the meaning becomes:

- `scope_type = 'system'` and `facility_id = null` => intentionally system-scoped
- `scope_type = 'facility'` and `facility_id = <uuid>` => intentionally facility-scoped

That is much clearer than the current model.

## 7. Migration Plan

### 7.1 Schema Migration

Add `scope_type` as nullable first.

Backfill:

- rows with `facility_id is null` => `scope_type = 'system'`
- rows with `facility_id is not null` => `scope_type = 'facility'`

Then:

- set `scope_type not null`
- add the scope/facility consistency check constraint

### 7.2 Example Backfill Shape

Illustrative SQL only:

```sql
alter table records_workflows
  add column if not exists scope_type text;

update records_workflows
set scope_type = case
  when facility_id is null then 'system'
  else 'facility'
end
where scope_type is null;

alter table records_workflows
  alter column scope_type set not null;

alter table records_workflows
  add constraint records_workflows_scope_matches_facility
  check (
    (scope_type = 'system' and facility_id is null) or
    (scope_type = 'facility' and facility_id is not null)
  );
```

The same pattern should be applied to `portal_profiles`.

## 8. Write-Path Requirements

Any code creating or updating these rows must set `scope_type` explicitly.

That includes:

- workflow extraction upserts
- manual/operator-created workflow rows
- portal profile upserts
- any data repair scripts

Required behavior:

- system-wide rows must write `scope_type = 'system'`
- facility rows must write `scope_type = 'facility'`

No new code should rely on `facility_id || null` as the scope decision.

## 9. Read-Path Requirements

Read paths should rank by explicit scope, not by `facility_id is null`.

### 9.1 Facility Packet

Facility packet selection should explicitly prefer:

1. facility-scoped rows for that facility
2. system-scoped fallback rows

### 9.2 System Packet

System packet selection should explicitly prefer:

1. true system-scoped rows
2. if there is exactly one active facility, the app may fall back to that facility-scoped row

That single-facility fallback should be a deliberate product rule, not an accidental side effect of nullability.

### 9.3 Why Keep Single-Facility Fallback

Because many hospital systems in this dataset are functionally "one real facility with one records page," even if they are modeled as a system plus one facility row.

Without explicit fallback behavior, the system packet can easily ignore the only good workflow.

## 10. Code Areas To Update

Primary touchpoints:

- `/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/db/schema.sql`
- `/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/src/repositories/workflowRepository.js`

Likely secondary touchpoints:

- `/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/src/services/targetedPageService.js`
- `/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/src/services/questionReviewService.js`
- any internal routes or services that currently query `facility_id is null` to mean "system-level workflow"

This should be approached as:

1. schema migration
2. write-path update
3. read-path update
4. packet verification

## 11. Rollout Plan

Recommended order:

1. Add `scope_type` to schema and backfill local DB.
2. Update code to read/write explicit scope.
3. Re-run packet smoke tests locally.
4. Validate known edge systems:
   - St. David's HealthCare
   - Methodist Health System
   - one multi-facility system
   - one single-facility system
5. Apply migration to Railway.
6. Re-run production packet checks.

## 12. Acceptance Criteria

This spec is complete when all of the following are true:

1. `records_workflows` and `portal_profiles` have explicit `scope_type`.
2. New writes set `scope_type` intentionally.
3. Packet selection code no longer depends on `facility_id is null` as a proxy for scope.
4. Single-facility systems can surface facility-scoped medical-records workflows in the system packet by explicit rule.
5. St. David's-style packet bugs no longer depend on whether the good workflow happened to be facility-scoped.
6. The DB enforces invalid combinations, such as:
   - `scope_type = 'system'` with a non-null `facility_id`
   - `scope_type = 'facility'` with a null `facility_id`

## 13. Why This Can Be Implemented Now

There is no deep blocker.

This can be implemented now because:

- the affected tables are already small and well-understood
- the current bug has already exposed exactly where the null-scope assumption leaks into behavior
- the selection logic is concentrated mainly in `workflowRepository.js`
- this is a schema migration plus read/write cleanup, not an architectural rewrite

The real reason it has not already been done is prioritization and migration risk, not feasibility.

## 14. Recommendation

Implement this as a focused cleanup pass after the current packet and PDF-pipeline stabilization work.

Do not bundle it into unrelated parser or editor changes.

Treat it as a data-model clarity improvement with direct product impact:

- fewer stale packet selections
- clearer workflow provenance
- less magic hidden in `null`
