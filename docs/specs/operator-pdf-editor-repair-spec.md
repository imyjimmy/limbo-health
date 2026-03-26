# Operator PDF Editor Repair Spec

Status: Draft
Owner: Limbo Health
Last updated: 2026-03-24

## 1. Purpose

Define how the Records Workflow Operator Dashboard PDF Editor should evolve from a PDF viewer into a true human repair tool for extracted PDF question mappings.

This spec is motivated by the Baylor Scott & White Health (BSWH) failure mode:

- the saved question draft contained two different "Other purpose" questions
- one was incorrectly bound to the `Fax Number` field
- the correct mapping existed elsewhere in the draft
- the correct question appeared far away from the parent question it belonged to
- the operator dashboard exposed the contradiction but did not provide a clean repair path

The goal is to make these issues repairable by a human inside the PDF Editor without direct database edits.

This includes both:

- semantic repairs
  - fixing which field a question is bound to
  - fixing question order
  - deleting duplicates

- spatial repairs
  - moving a mapped rectangle
  - resizing a mapped rectangle
  - defining signature-question geometry for the form

## 2. Core Principle

The Operator Dashboard is not a hidden compute engine.

It is:

- an orchestrator for discrete workflow modules
- a viewer of persisted workflow artifacts
- a human repair surface for correcting persisted artifacts

It is not:

- a place where opening a screen silently reruns parse logic
- a place where truth is inferred from transient UI overlays
- a place where operators must fall back to SQL to fix bad extracted data

## 3. Source of Truth

For a PDF question-review session, the editor must work from persisted artifacts only.

Required artifacts:

1. Source document artifact
   - the accepted PDF itself

2. Parsed PDF artifact
   - page geometry
   - widgets
   - field metadata

3. Question draft artifact
   - extracted questions
   - bindings
   - question order
   - human-adjusted rectangle geometry
   - signature-question geometry
   - human edits

4. Published question artifact
   - immutable published version derived from a reviewed draft

Rules:

- Opening the editor must read these artifacts.
- Opening the editor must not reparse the PDF.
- Overlay rectangles are a visualization of saved bindings plus saved geometry.
- Missing geometry must never be interpreted as "no mappings exist."
- Signature questions must be treated as ordinary persisted draft entries with a special `kind`, not ephemeral UI state.

## 4. Problem Statement

The current PDF Editor is effectively a viewer with a limited overlay-draft mode.

Current gaps:

- operators cannot directly repair a wrong extracted field binding
- operators cannot move a mapped rectangle when extracted geometry is slightly wrong
- operators cannot resize a mapped rectangle when the bounds are wrong
- operators cannot move a misplaced follow-up question next to its parent question
- operators cannot delete a duplicate extracted question
- operators cannot define the signature question area of the form
- the UI can show "0 mapped rectangles" even when saved bindings exist
- the editor does not clearly distinguish:
  - saved binding truth
  - renderable overlay availability

This creates a broken human-in-the-loop workflow:

- extraction can be mostly right
- operator can see what is wrong
- operator still cannot actually fix it in the tool

## 5. Goals

The PDF Editor must support the following minimum repair loop:

1. Open a PDF question-review session from persisted artifacts.
2. Inspect each saved question and its saved bindings.
3. Rebind a selected question to a different PDF field.
4. Move a selected mapped rectangle and persist the updated coordinates.
5. Resize a selected mapped rectangle and persist the updated coordinates.
6. Reorder a selected question relative to nearby questions.
7. Delete a duplicate or bad extracted question.
8. Define and adjust the signature question area of the form.
9. Save the repaired draft.
10. Publish a reviewed version.

The first version of this editor should optimize for correctness and auditability, not fancy interaction design.

## 6. Non-Goals

Not required in the first repairable version:

- fully freeform visual authoring for every question type
- pixel-perfect drag-and-drop schema editing
- automatic duplicate resolution without human confirmation
- generalized workflow-builder UX across all stages
- replacing the broader pipeline orchestration model

## 7. Data Model Requirements

The question draft artifact must be treated as an editable ordered list.

Each question entry must preserve:

- `id`
- `label`
- `kind`
- `help_text`
- `required`
- `options`
- `bindings`
- question order within the list

Manual edits must modify the draft artifact directly.

Publishing must create a new immutable published version from the current draft artifact.

Spatial edits must also be persisted.

At minimum, the system must persist:

- binding geometry for overlay-based mappings
- any human-adjusted rectangle coordinates used to override or refine extracted geometry
- signature-question geometry

Recommendation:

- represent signatures as one or more explicit questions with a special `kind`, such as `signature`
- keep their geometry on those question bindings the same way other editable questions persist geometry
- only introduce extra signature-specific metadata later if multi-signer or role-specific workflows truly require it

## 8. Editor Requirements

## 8.1 Open

When an operator opens a PDF in the editor, the system must load:

- source document metadata
- parsed PDF geometry artifact
- current draft payload
- published versions

If geometry is missing:

- the editor must still show saved questions and saved bindings
- the editor must clearly say overlay rendering is unavailable
- the editor must not imply that mappings do not exist

## 8.2 Inspect

For each selected question, the editor must show:

- question label
- question type
- saved binding count
- binding details
  - field names for acroform bindings
  - page/coordinates for overlay bindings
- whether overlay rendering is currently available

If a question has a spatial rectangle representation, the editor must also show:

- page index
- x/y coordinates
- width/height
- whether the current rectangle came from:
  - extracted widget geometry
  - human-adjusted overlay geometry

The editor must distinguish:

- `Saved bindings`
- `Rendered overlay rectangles`

These are not interchangeable metrics.

## 8.3 Repair Actions

The minimum required repair actions are:

1. Rebind question
   - select a question
   - choose a different PDF field from the parsed widget list
   - replace or update the saved binding

2. Move rectangle
   - select a mapped question rectangle
   - drag it to a new position
   - persist updated coordinates on save

3. Resize rectangle
   - select a mapped question rectangle
   - resize via handles or equivalent direct manipulation
   - persist updated width/height on save

4. Reorder question
   - move selected question up
   - move selected question down

5. Delete question
   - remove a bad duplicate
   - require confirmation

6. Define signature question area
   - create one or more signature questions on the PDF
   - allow move and resize
   - persist signature geometry on the signature question bindings

7. Add question
   - out of scope for the first acroform repair pass unless already supported
   - can remain limited to manual overlay mode initially

## 8.4 Save and Publish

Save Draft:

- persists the edited question draft artifact
- does not mutate published versions

Publish:

- validates the edited draft
- writes a new published version artifact
- updates the active published reference where appropriate

## 8.5 Auditability

Manual repair must be auditable.

At minimum, the system should preserve:

- when the draft changed
- who changed it
- what action occurred
- rebound field
- moved rectangle
- resized rectangle
- moved question
- deleted question
- defined signature question area
- published draft

The exact event schema can be defined separately, but the editor must be built with auditability in mind.

## 9. UI Requirements

The first real repair UI should stay simple.

Recommended layout:

1. Question list
   - ordered
   - selected row highlighted
   - shows whether question has saved bindings

2. Repair controls
   - selected question summary
   - current binding display
   - field picker
   - x/y/width/height display when applicable
   - move up
   - move down
   - delete
   - signature-question tools
   - save draft
   - publish

3. PDF view
   - rendered PDF page
   - overlay rectangle preview when geometry is available
   - draggable/resizable rectangles for editable mappings
   - draggable/resizable signature-question overlays

Important:

- do not hide repair actions behind a special "manual mapping" mode when the operator is editing an existing extracted draft
- do not force operators into overlay-only authoring just to repair an acroform binding
- do not treat the signature question as an afterthought; it is part of the editable question artifact

## 10. BSWH Acceptance Criteria

The BSWH example should be repairable entirely through the editor.

Acceptance criteria:

1. The operator can select the bad question:
   - `If you selected 'Other (please specify)' as purpose, please describe:`

2. The operator can see that it is currently bound to the wrong field:
   - `Fax Number`

3. The operator can rebind it to the correct field:
   - `fill_4`

4. The operator can move the corrected question so it stays adjacent to:
   - `Purpose of the use and/or disclosure (select all that apply):`

5. The operator can delete the duplicate later question:
   - `If other, specify the purpose of the use or disclosure`

6. The operator can move or resize any repaired rectangle if extracted geometry is slightly off.

7. The operator can define the signature question area for this form and see it persist on reopen.

8. After saving, reopening the editor shows:
   - one "Other purpose" follow-up question
   - correct binding
   - correct ordering

9. After publishing, downstream consumers read the repaired published artifact.

## 11. Architecture Alignment

This editor must align with the broader records workflow direction:

- discrete workflow modules
- persisted artifacts at each module boundary
- dashboard-controlled orchestration
- human repair on artifacts
- infrastructure portability across Railway and AWS

This spec intentionally avoids tying the editor to Railway-specific behavior.

The artifact contract should remain valid after AWS cutover.

## 12. Proposed Delivery Phases

## Phase 1: Repairable Acroform Drafts

Required:

- load persisted parsed artifact
- show saved binding truth
- rebind selected short-text question to a parsed widget field
- move and resize persisted mapping rectangles
- move question up/down
- delete duplicate question
- define and edit signature-question geometry
- save draft
- publish

## Phase 2: Better Human Repair UX

Optional improvements:

- click-to-bind directly from highlighted PDF widgets
- inline diff between draft and published version
- side-by-side duplicate detection assistance
- keyboard shortcuts for reorder and delete

## Phase 3: Full Manual Authoring

Optional:

- complete overlay authoring for unsupported PDFs
- create new questions of multiple kinds
- option-level binding editing for checkbox/radio groups

## 13. Open Questions

1. Should question reorder be represented only by array order, or should we add an explicit `sequence_no`?
2. Do we want a dedicated audit log table for editor actions, or should draft/version history be sufficient initially?
3. Should duplicate detection warnings be part of the editor, or part of extraction review before publish?
4. When a field is rebound, should old bindings be hard-replaced by default, or should operators be able to keep multiple bindings?
5. Should `kind: "signature"` support multiple signer roles on day 1, or start with a single generic patient/legal representative signature question?

## 14. Recommendation

Build Phase 1 first.

That is the smallest version that turns the current PDF "viewer" into a real operator repair tool without overdesigning the experience or locking us into Railway-specific behavior.
