# Records Request Monetization Spec

**Status:** Draft
**Owner:** Limbo Health
**Last updated:** 2026-03-21

## 1. Purpose

Define a practical monetization plan for the records-request product that fits the current Limbo Health mobile workflow.

This spec assumes the current optimistic starting point:

1. the user can search for a hospital or health system
2. the app can guide them through a records-request workflow
3. the app can generate a filled PDF packet
4. the user can export or share that packet

The key decision in this spec is:

- do **not** treat passive request tracking as the primary paid product
- do treat **smart request creation** as the primary paid product

## 2. Product Decision Summary

### 2.1 Always free

The following stay free:

- hospital search
- workflow instructions
- access to official blank or official downloadable forms
- medical binder access
- dashboard shell for request history
- viewing already-created requests
- a low-assistance path for making a request without premium customization

### 2.2 Complimentary free value

Each user gets **one free smart self-request**.

That first request should be generous:

- full facility-specific answer flow
- full answer customization
- autofill
- packet generation
- packet export

This is the core proof-of-value experience.

### 2.3 Paid value

The paid product is **additional smart request creation**.

Paid unlocks:

- additional smart requests for yourself after the free first one
- smart requests made on behalf of someone else
- premium answer customization for facility-specific forms

### 2.4 What is not the paid product

Do **not** make these the main paid surface:

- binder access
- passive request tracking alone
- fee reminders by themselves
- access to already-created requests
- the user's legal right to request their records

## 3. Why This Is The Right Monetization Boundary

Once the PDF is generated and sent, the hospital system becomes the main source of delay.

At that point, the app can still be useful, but the strongest value has already happened:

- translating a facility's form into a usable answer flow
- helping the patient choose what records they want
- mapping those answers back into the right PDF
- reusing identity, signature, and supporting materials

That means the strongest honest monetization point is **before or during advanced request creation**, not after the request is already in the hospital's queue.

This also supports a fair product story:

- the first time, prove the value for free
- after that, charge for using the power tool again
- keep a functional free path for users who do not want premium help

## 4. Current Starting Point In The Repo

Today the repo already has:

- a guided records-request flow in `apps/react-native/app/records-request.tsx`
- packet generation and sharing
- a post-generation success state
- a placeholder `Pending Requests` surface in `apps/react-native/app/(tabs)/(binders)/index.tsx`

This spec builds on that flow rather than replacing it.

## 5. Core Product Layers

### 5.1 Free basic request path

The basic path must remain real and usable.

It should provide:

- hospital workflow instructions
- official blank or official downloadable forms
- contact methods and submission instructions
- a low-assistance request flow when safe to offer

The basic path does **not** promise:

- facility-specific question extraction
- rich answer customization
- best-effort mapping of nuanced preferences back into every PDF

At launch, the fallback may simply be:

- workflow instructions
- official form access
- light request logging

If a safe generic low-assistance question flow is built later, it should sit inside this free basic layer.

### 5.2 Smart self-request

A smart self-request is the premium version of request creation for the account holder's own records.

It includes:

- facility-specific question flow
- answer customization such as complete chart vs subset
- date-range or scope selection when supported
- delivery preference capture when supported
- signature and ID reuse
- packet generation and export
- bundled request tracking after generation

### 5.3 Smart proxy or family request

A smart proxy request is the premium version of request creation for someone else, such as:

- an elderly parent
- a child
- a spouse or dependent

It includes the smart-request features plus:

- proxy relationship capture
- authorization-specific guidance
- additional supporting document handling as needed

These requests should be premium from the beginning because they are more complex and more valuable.

### 5.4 Request tracking as a bundled companion feature

Request tracking remains useful, but it is **not** the main thing users pay for.

Tracking should be positioned as:

- a companion feature to a created request
- supportive organization for an external process
- a way to keep notes, proof, reminders, and outcomes together

Not as:

- a standalone premium dashboard
- a promise that Limbo can control the hospital workflow

## 6. Entitlement Model

### 6.1 Complimentary starter entitlement

Each account receives one complimentary entitlement:

- `smart_self_request_credit`

Rules:

- it can only be used when the request is for the signed-in user
- it should unlock the full smart flow
- it should feel generous, not crippled

### 6.2 Paid entitlements

Recommended entitlement types:

- `smart_self_request_credit`
- `smart_proxy_request_credit`

The pricing relationship is a product decision, but proxy credits can reasonably cost more than self-request credits.

### 6.3 Redemption timing

Do **not** redeem a credit just because the user opens a paywall or begins exploring a flow.

Recommended behavior:

1. user chooses smart request creation
2. app checks for an available credit
3. if no credit exists, app offers purchase
4. once a credit is available, the user can proceed through the smart flow
5. the credit is redeemed only when packet generation succeeds

This prevents a user from losing a paid credit on an abandoned draft.

### 6.4 Restore and permanence rules

The entitlement service must support:

- restoring purchased credits
- distinguishing available vs redeemed credits
- keeping already-created request cases accessible

Once a request has been created through a redeemed entitlement, the user should retain access to that request and its history.

## 7. Gate Placement

### 7.1 First self-request

For the user's first self-request:

- no hard paywall
- full smart flow is unlocked

### 7.2 Second and later self-requests

For the second self-request and beyond:

- present a smart-request paywall before the advanced facility-specific answer flow
- offer a free fallback into the basic path

The choice should be:

- `Unlock Smart Request`
- `Continue With Basic Request`

### 7.3 Proxy and family requests

For requests made on behalf of someone else:

- gate the smart proxy flow before advanced question entry
- still offer the free basic path with official forms and instructions

### 7.4 What should never be gated

Do not gate:

- binder access
- hospital search
- official forms
- already-created request cases
- viewing request history

## 8. What Users Are Actually Paying For

Users are paying for the app to do hard customization work repeatedly.

That includes:

- understanding a facility-specific form
- turning that form into a patient-friendly answer flow
- letting the user choose nuanced request scope
- carrying their identity and supporting materials forward
- reducing repeated manual work across multiple facilities
- supporting more complex proxy scenarios

The app should describe the value in those terms.

It should **not** describe the paid product as:

- paying for a legal records request right
- paying for a generic dashboard
- paying to watch the hospital be slow

## 9. The Free Basic Path

The free fallback path is important both ethically and strategically.

It preserves trust because users can still request records without buying premium help.

### 9.1 Launch recommendation

At launch, the basic path can be:

- instructions
- official blank or official forms
- saved hospital contacts
- optional manual request logging

### 9.2 Future enhancement

Later, the basic path can include a generic low-assistance request flow that covers common fields such as:

- patient identity
- contact information
- coarse request type
- signature and ID attachment

If built, that generic flow must be explicit about its limits:

- it is not facility-specific
- it may not expose every nuanced option a hospital form supports
- it is a simpler fallback, not the premium experience

## 10. Request Cases And Tracking

### 10.1 Positioning

Every created request can have a request case.

A request case should bundle:

- status
- timeline
- proof attachments
- fee notice logging
- received-record logging
- reminders

This should be available as a companion feature, not a standalone paid SKU.

### 10.2 Fee notice scope

Do **not** describe this as fee handling.

The app can support:

- logging that the hospital asked for payment
- attaching the notice or screenshot
- reminding the user to respond
- letting the user mark the fee paid

The app does **not** inherently:

- receive fee notices from the hospital
- act as the payer
- negotiate or dispute fees
- represent itself to the hospital as the sender of record

### 10.3 External submission reality

The app cannot inherently detect:

- whether the user actually sent the email from desktop
- whether a hospital portal upload succeeded
- whether a third-party fax tool completed

So the request case must be built around:

- user-confirmed events
- optional proof attachments
- supportive reminders and next-step guidance

## 11. Recommended User Flows

### 11.1 First smart self-request

1. User selects a hospital.
2. User indicates the request is for themself.
3. App detects an unused complimentary self-request credit.
4. App enters the full smart request flow.
5. User answers facility-specific questions.
6. App generates the packet.
7. Complimentary credit is redeemed.
8. App creates a request case and offers `Share PDF`.

### 11.2 Second or later self-request

1. User selects a hospital.
2. User indicates the request is for themself.
3. App detects no remaining self-request credits.
4. App offers:
   - `Unlock Smart Request`
   - `Continue With Basic Request`
5. If user purchases or already has a paid self credit, app enters the smart flow.
6. Credit is redeemed only after successful packet generation.

### 11.3 Proxy request

1. User selects a hospital.
2. User indicates the request is for someone else.
3. App offers:
   - `Unlock Proxy Request`
   - `Continue With Basic Request`
4. If purchased, app enters the proxy smart flow.
5. Credit is redeemed only after successful packet generation.

### 11.4 After packet generation

After a request packet exists:

- user can export or share it
- user can mark the request sent later
- user can attach proof
- user can log a fee notice
- user can log received records

These follow-up features are valuable, but they are not the main monetization lever.

## 12. State Machine

The request case lifecycle can stay simple:

- `draft`
- `packet_generated`
- `sent`
- `awaiting_response`
- `fee_requested`
- `fee_paid`
- `records_received`
- `closed`
- `abandoned`

Status should be derived from timeline events where practical.

## 13. Timeline Event Model

Recommended event types:

- `draft_created`
- `smart_credit_redeemed`
- `packet_generated`
- `pdf_shared`
- `submission_channel_selected`
- `user_marked_sent`
- `proof_attached`
- `fee_notice_added`
- `fee_marked_paid`
- `records_arrived`
- `records_imported_to_binder`
- `case_closed`

## 14. Data Model

### 14.1 Smart request entitlement

```ts
type SmartRequestEntitlement = {
  id: string;
  kind: 'self' | 'proxy';
  source: 'complimentary' | 'iap' | 'web_checkout' | 'promo';
  state: 'available' | 'redeemed' | 'expired' | 'refunded';
  grantedAt: string;
  redeemedAt: string | null;
  redemptionDraftId: string | null;
};
```

### 14.2 Request draft

```ts
type RecordsRequestDraft = {
  id: string;
  subjectType: 'self' | 'proxy';
  requestMode: 'basic' | 'smart';
  entitlementId: string | null;
  createdAt: string;
  updatedAt: string;
  packetSnapshot: {
    hospitalSystemId: string;
    hospitalSystemName: string;
    state: string | null;
    formName: string | null;
    formUrl: string | null;
    methods: string[];
    contacts: Array<{ type: string; label: string | null; value: string }>;
    instructions: Array<{ sequenceNo: number; details: string }>;
  };
  answers: Record<string, unknown>;
  hadSignature: boolean;
  hadIdAttachment: boolean;
  generatedPdf: {
    fileName: string;
    localUri: string | null;
    generatedAt: string | null;
  };
};
```

### 14.3 Request case

```ts
type RequestCase = {
  id: string;
  draftId: string;
  subjectType: 'self' | 'proxy';
  requestMode: 'basic' | 'smart';
  entitlementRedemptionId: string | null;
  createdAt: string;
  updatedAt: string;
  status: string;
  channel: 'email' | 'fax' | 'mail' | 'portal_upload' | 'other' | null;
  submittedAt: string | null;
  events: RequestCaseEvent[];
  reminders: RequestCaseReminder[];
  attachments: RequestCaseAttachment[];
  notes: string | null;
};
```

### 14.4 Attachments and reminders

```ts
type RequestCaseAttachment = {
  id: string;
  kind: 'submission_proof' | 'fee_notice' | 'received_records' | 'other';
  fileName: string;
  mimeType: string;
  localPath: string;
  createdAt: string;
};

type RequestCaseReminder = {
  id: string;
  kind: 'follow_up' | 'fee' | 'records_due';
  dueAt: string;
  state: 'pending' | 'done' | 'dismissed' | 'snoozed';
  completedAt: string | null;
};
```

## 15. Storage Strategy

### 15.1 Local-first request data

For launch:

- store drafts locally and encrypted
- store request cases locally and encrypted
- store attachments as encrypted local sidecars

Do **not** require a PHI-heavy backend just to ship this feature set.

### 15.2 Backend responsibility

Use `auth-api` or an equivalent entitlement service only for:

- tracking available credits
- recording redemption
- restoring purchases

Do **not** send request contents, hospital details, notes, or attachments into that service.

### 15.3 Binder separation

Do not force request-case data into the medical binder repo for v1.

Keep request operations separate from canonical medical records until there is a stronger sync and data-model story.

## 16. Payment Surfaces

### 16.1 Paywall copy direction

The paywall should explain:

- this unlocks the full facility-specific request flow
- it saves repeated manual form work
- it supports richer answer customization

It should not imply:

- Limbo guarantees hospital turnaround
- Limbo handles fees on the user's behalf
- Limbo becomes the hospital-facing sender of record

### 16.2 Platform recommendation

If sold inside the native iOS app, use an entitlement model compatible with App Store requirements.

The safest assumption is:

- native purchase grants a credit
- a credit is redeemed when packet generation succeeds

## 17. Launch Scope Recommendation

## Phase 1: Monetized smart request creation

- grant one complimentary self-request credit per account
- support paid self-request credits
- support paid proxy-request credits
- branch between smart and basic request paths
- keep basic request access free
- create local request cases and timelines
- bundle tracking with created requests

## Phase 2: Stronger basic path

- add a generic low-assistance request helper if safe
- preserve access to official forms and instructions as fallback
- improve repeated-request ergonomics

## Phase 3: Family and multi-request packaging

- small credit packs
- family or caregiver bundles
- stronger import of received records into the binder

## 18. Acceptance Criteria

- a new user can complete one full smart self-request without payment
- the first free self-request is not artificially crippled
- a second self-request offers a paid smart path and a free basic fallback
- a proxy request offers a paid smart path and a free basic fallback
- binder access remains free
- request history remains viewable without paywalling the dashboard
- request cases can log proof, fee notices, and received records
- the app does not claim to handle hospital fees on the user's behalf
- the monetization story centers on repeated premium request creation, not passive tracking

## 19. Open Questions

- should proxy requests use a distinct SKU or consume multiple standard credits?
- should the basic fallback launch as instructions plus official forms only, or include a generic low-assistance flow immediately?
- should purchased credits also come in small packs?
- when a smart request is regenerated for the same facility and same subject, should it consume a new credit or reuse the prior one?
