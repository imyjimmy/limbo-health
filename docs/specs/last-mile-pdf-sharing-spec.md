# Last Mile PDF Sharing Spec

Status: Draft
Owner: Limbo Health
Last updated: 2026-04-01

## 1. Goal

Make the final step of a records request feel clear, trustworthy, and low-friction once the filled PDF exists.

## 2. Problem

The current end-of-flow experience is weak in three ways:

- users are unclear how to send the completed PDF
- the app cannot clearly distinguish between a true email send and a generic share action
- the Home screen does not reflect that a request is in progress once the user leaves the form flow

## 3. Product Principles

- prefer clarity over cleverness
- only claim a request was `sent` when the app has a real signal
- do not pretend `Share` and `Email` are the same action
- keep copy short and action-oriented
- track user intent when certainty is impossible

## 4. Final Review Screen

The final screen should include:

- the filled PDF preview
- `Sending Instructions` sourced from the backend pipeline
- action buttons for `Share`, `Email`, and disabled `Fax`
- back and start over controls

`Sending Instructions` should show abbreviated structured data:

- email
- fax
- mail address
- questions / status phone

## 5. Email Behavior

When the user taps `Email`:

- open Apple Mail composer if available
- prefill recipient from `Sending Instructions`
- prefill subject with something like `Medical records request`
- attach the filled PDF
- prefill a short body such as `Attached is the completed records request PDF.`

If Apple Mail composer returns `sent`:

- show a dopamine-inducing success screen
- headline should clearly say the records request was sent
- record a pending request entry on Home
- method should be stored as `email`

If Apple Mail composer returns anything else:

- do not mark the request as sent
- return to the review screen
- no success state

If Apple Mail composer is unavailable:

- show a clear message that Apple Mail must be set up to send with attachment
- direct the user to use `Share` for Gmail, Outlook, AirDrop, Files, or similar

## 6. Share Behavior

When the user taps `Share`:

- open the native share sheet with the filled PDF

Important platform constraint:

- Share does not return a meaningful completion status
- the app cannot know whether the user emailed it, AirDropped it, saved it, printed it, or cancelled

What the app can know:

- `Share` was pressed
- the user returned from the share sheet

Because of that, after the user returns from Share, show a lightweight follow-up prompt:

Prompt:

- `What will you do with this PDF?`

Options:

- `I’ll email it`
- `I’ll AirDrop it to another device`
- `I’ll send it to someone helping me`
- `I’ll print or mail it`
- `I’ll save it for later`
- `I’m not sending it yet`

This prompt is intent capture, not proof of delivery.

## 7. Post-Share Tracking

If the user chooses one of the follow-up options, create a pending request entry with the selected method:

- `email_planned`
- `airdrop`
- `shared_with_helper`
- `mail`
- `saved_for_later`
- `not_sent`

Do not mark these as `sent`.

The pending request should remember the exact answer the user chose in the post-Share question.

That stored answer should drive the Home screen copy, for example:

- `I’ll email it`
- `I’ll AirDrop it to another device`
- `I’ll send it to someone helping me`
- `I’ll print or mail it`
- `I’ll save it for later`
- `I’m not sending it yet`

Pending Requests should also let the user check off whether they have actually completed that planned action yet.

Example:

- user picks `I’ll print or mail it`
- Home shows that planned next step
- once the user has actually mailed it, they can mark it complete

## 8. Success Screen

Only shown after Apple Mail composer returns `sent`.

Purpose:

- reward completion
- reassure the user the request is on its way
- provide a clear next step

It should include:

- celebratory confirmation that the request was sent
- hospital name
- sending method: `Email`
- timestamp
- CTA to return Home
- optional CTA to view pending requests

Suggested headline:

- `Request sent`

Suggested supporting copy:

- `Your medical records request was emailed successfully.`

## 9. Home Screen: Pending Requests

Home should no longer only show `No Pending Requests` once a user has taken a send action.

Each pending request entry should include:

- hospital name
- current state
- send method
- timestamp

Example states:

- `Sent by email`
- `Ready to email`
- `Ready to AirDrop`
- `Saved for later`
- `Print or mail`

If the request was created from Mail composer `sent`, show:

- `Sent by email`

If the request came from Share follow-up intent, show a planned state instead of sent.

Pending Requests should remember the user’s chosen answer from the post-Share follow-up question and display that planned path until the user marks it complete.

Pending Requests should support a simple completion control so the user can check off that they have now done the thing they planned to do.

Examples:

- `Will email`
- `Will AirDrop`
- `Will send to helper`
- `Will print or mail`
- `Saved for later`

If the request came from Apple Mail composer and the composer returned `sent`, Pending Requests should automatically show that it was emailed without asking the follow-up question.

## 10. Data Model

Minimal fields for a pending request:

- `id`
- `hospitalSystemId`
- `hospitalName`
- `formTitle`
- `status`
- `method`
- `plannedActionLabel`
- `completedAt`
- `createdAt`
- `updatedAt`

Example status values:

- `sent`
- `planned`
- `draft`

Example method values:

- `email`
- `email_planned`
- `airdrop`
- `shared_with_helper`
- `mail`
- `saved_for_later`

The model should distinguish between:

- automatically confirmed send state from Apple Mail composer `sent`
- user-declared planned next step after Share
- user-checked completion after a planned next step is done

## 11. Copy Rules

Use present or future tense carefully:

- only use `sent` when Mail composer returns `sent`
- after Share returns, use future-tense copy because nothing is confirmed

Good:

- `What will you do with this PDF?`
- `I’ll email it`

Bad:

- `I emailed it`
- `I shared it with someone helping me`

## 12. Non-Goals

This spec does not try to:

- prove actual SMTP delivery
- prove AirDrop completion
- detect what app was used inside Share
- infer user intent without asking

## 13. Acceptance Criteria

- tapping `Email` opens Apple Mail composer with recipient, subject, and PDF attachment when available
- if Mail composer returns `sent`, the app shows a success screen and creates a `Pending Request` with method `email`
- if Mail composer returns `sent`, Pending Requests automatically shows that the request was emailed
- if Mail composer does not return `sent`, no sent confirmation is shown
- tapping `Share` opens the native share sheet
- when the user returns from Share, the app asks `What will you do with this PDF?`
- the selected answer creates a `Pending Request` entry with the appropriate planned method
- the selected answer is remembered and shown in Pending Requests
- Pending Requests lets the user check off when that planned action is actually done
- Home reflects the request under `Pending Requests`
- `Share` and `Email` are no longer treated as equivalent actions
- `Sending Instructions` remain visible and sourced from the backend pipeline
