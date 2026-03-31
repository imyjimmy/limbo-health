# App Store Submission Spec: Current-State Limbo Health

Date: March 30, 2026

## Goal

Submit the current iOS app to the App Store without pretending the product is broader or more automated than it really is today.

The release posture for this submission is:

- Texas-first medical-records request assistant
- local personal-info profile for prefill
- encrypted local binder functionality remains available
- production viability depends on Railway `records-workflow-api` staying current with the local records-workflow dataset

This spec is intentionally for the app as it exists now, not for a future nationwide or fully automated release.

## Sources of Truth

Current app configuration and feature surface:

- `apps/react-native/app.json`
- `apps/react-native/eas.json`
- `apps/react-native/app/(auth)/welcome.tsx`
- `apps/react-native/app/records-request.tsx`
- `apps/react-native/app/(tabs)/home.tsx`
- `apps/react-native/app/(tabs)/page.tsx`
- `apps/react-native/app/(tabs)/(binders)/index.tsx`
- `apps/react-native/app/(tabs)/profile/account.tsx`
- `apps/react-native/providers/AuthProvider.tsx`
- `apps/react-native/providers/BioProfileProvider.tsx`

Current Apple requirements:

- App Review Guidelines: <https://developer.apple.com/app-store/review/guidelines/>
- Account deletion guidance: <https://developer.apple.com/support/offering-account-deletion-in-your-app/>
- App Privacy Details: <https://developer.apple.com/app-store/app-privacy-details/>
- Screenshot specifications: <https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications>

## Current Product Snapshot

### Build identity

- App name: `Limbo Health`
- Bundle identifier: `com.limbohealth.mobile`
- Current Expo version: `1.2.1`
- Current iOS build number: `4`
- Orientation: portrait only
- iPad support: currently enabled

### What the app does today

The current binary exposes five real surfaces:

1. Account onboarding and sign-in
   - Google sign-in exists today.
   - Nostr key import/generation also exists today.
2. Personal medical-info profile
   - Full name
   - DOB
   - last 4 SSN
   - phone
   - email
   - mailing address
   - stored locally on device via SecureStore
3. Texas records-request workflow
   - search Texas hospital systems
   - fetch a hospital-specific request packet from `limbo.health`
   - answer autofill questions
   - attach ID image
   - draw signature
   - generate completed PDF when a supported cached PDF + published schema exists
4. Portal/browser assistance
   - in-app hospital portal browser
   - local credential vault
   - biometric unlock/fill for saved credentials
   - human-required steps remain manual
5. Encrypted digital binders
   - local encrypted records repo
   - create/edit entries
   - quick capture for photo/audio
   - QR/share flows

### Permissions currently declared

- Camera
- Photo library
- Microphone

These are declared in `app.json` and are consistent with the current binder and records-request surfaces.

## Submission Scope

The App Store submission must market the app as an administrative records-access product, not a diagnostic or treatment product.

### App Store positioning

Primary promise:

- find supported Texas hospital systems
- reuse personal info to fill records-request forms
- generate completed PDFs for supported hospital forms
- keep medical records and request data private on device where possible

Secondary promise:

- maintain an encrypted personal medical binder
- store portal credentials locally on device

### Explicit non-promises

The metadata, screenshots, review notes, and in-app copy must not imply any of the following:

- nationwide support
- all hospitals are supported
- every hospital has a fillable PDF
- diagnosis, treatment, clinical decision support, or medical measurement
- fully automated completion of human-required portal steps

## Apple Review Constraints That Matter For This Release

### 1. App completeness is mandatory

Apple says submissions should be final, fully functional, and free of placeholder content, and login-based apps must include demo account info and live backend access. See App Review Guideline 2.1(a).

Implication for Limbo:

- no blank tabs
- no dead menu rows
- no placeholder metadata or empty URLs
- Railway must be live and ready during review

### 2. Google login triggers the Sign in with Apple rule

Apple says apps that use a third-party or social login service for the user’s primary account must also offer an equivalent login option with Sign in with Apple characteristics. See App Review Guideline 4.8.

Implication for Limbo:

- the current Google login path is a probable rejection risk unless addressed

### 3. Medical apps receive greater scrutiny

Apple says medical apps that could provide inaccurate data or be used for diagnosing or treating patients are reviewed with greater scrutiny, and users should be reminded to check with a doctor before making medical decisions. See App Review Guideline 1.4.1.

Implication for Limbo:

- Limbo must be framed as records access / administrative support
- no clinical efficacy claims
- add or retain clear non-diagnostic language in product copy and review notes

### 4. Support information must be reachable

Apple says the app and its Support URL must include an easy way to contact the developer. See App Review Guideline 1.5.

Implication for Limbo:

- a real support URL is required
- the app should expose support/contact info in-app as well

### 5. Account deletion is already required

Apple requires apps with account creation to let users initiate account deletion inside the app. Apple's support guidance says this should be easy to find and should delete the full account record, not merely deactivate it.

Implication for Limbo:

- current account deletion flow is a strength and should be preserved
- reviewer notes should explicitly mention where to find it

### 6. Privacy policy URL is required

Apple says a publicly accessible Privacy Policy URL is required on the product page. App Privacy Details also say web-view data collection must be declared if the app collects it, and data processed only on device is not considered collected.

Implication for Limbo:

- a public privacy policy URL is required before submission
- the privacy label must be filled from the actual implementation, not guessed
- on-device-only bio profile, binder content, portal credentials, and local key material should not be disclosed as collected unless sent off device

### 7. Screenshot requirements depend on device support

The current app supports iPad. Apple requires iPhone screenshots and, if the app runs on iPad, iPad screenshots as well.

Implication for Limbo:

- either keep iPad support and provide iPad screenshots
- or disable iPad support before submission to reduce scope

## Submission Decision

This release should be treated as:

- primary category: `Medical`
- Texas-only launch
- backend-dependent but production-backed, not beta

## P0 Requirements Before Submission

These are go/no-go items.

### P0.1 Resolve login compliance

One of the following must be true before submission:

- Option A: add Sign in with Apple and keep Google login
- Option B: remove Google login from the App Store binary and submit with Nostr-only onboarding

Recommendation:

- fastest path if the goal is "submit current app quickly": remove Google from the binary for v1
- better long-term path: add Sign in with Apple and keep Google

Current code that creates the issue:

- `apps/react-native/core/auth/googleAuth.ts`
- `apps/react-native/app/(auth)/welcome.tsx`
- `apps/react-native/providers/AuthProvider.tsx`

### P0.2 Remove incomplete or inert UI surfaces

The binary submitted to Apple must not expose placeholder surfaces.

Current risks:

- `apps/react-native/app/(tabs)/create.tsx` is an empty stub
- `apps/react-native/app/(tabs)/profile/index.tsx` shows `Notifications` and `About` rows that currently do nothing

Required action:

- hide, remove, or implement these surfaces before submission

### P0.3 Add required public metadata URLs

Before submission, App Store Connect must have:

- Privacy Policy URL
- Support URL

And the app itself should expose:

- support email or support page
- privacy policy link

Current gap:

- no obvious checked-in privacy-policy or support surface is wired into the mobile app today

### P0.4 Lock the release scope to Texas supported systems only

The app review flow must depend only on systems for which the backend returns a supported cached PDF with a published question schema.

Operational rule:

- the hospital-system search shown to the reviewer must only surface Texas systems with supported PDFs
- no unsupported systems should appear in the records-request search flow

Backend rule:

- Railway `records-workflow-api` must stay synced with the local records-workflow database and storage artifacts used as source of truth

### P0.5 Reviewer access must be deterministic

Before submission:

- provide a working reviewer account path
- provide exact reviewer steps
- verify Railway is live at submission time
- verify at least two reviewer-safe Texas systems end to end on the production backend

Reviewer flow must not rely on "search around until you find a working hospital".

### P0.6 Decide iPad support

Before submission, choose one:

- keep `supportsTablet: true` and produce iPad screenshots
- disable iPad support and submit iPhone-only

Recommendation:

- disable iPad support for this first App Store submission unless the UI has been explicitly checked on iPad

## P1 Strong Recommendations

These are not automatic blockers, but they materially lower review risk.

### P1.1 Tighten marketing copy

Avoid screenshots or metadata that emphasize speculative claims such as:

- private AI
- medical tourism
- second opinions

unless the exact feature is clearly present and reviewer-accessible in the build.

### P1.2 Add a plain-language medical disclaimer

Add a short disclaimer in one or more of:

- onboarding
- records-request entry screen
- profile/about/support surface

Suggested stance:

- Limbo helps organize and submit records requests
- Limbo does not diagnose, treat, or replace a clinician

### P1.3 Keep the review path on the records-request flow

For this submission, screenshots and review notes should center on:

- onboarding
- bio profile
- Texas hospital selection
- question flow
- ID + signature
- generated PDF

The encrypted binder and portal-assist features can remain in the binary, but they should not be the primary story for App Review.

## App Store Connect Package

### Recommended listing posture

- Name: `Limbo Health`
- Subtitle: Texas medical records requests
- Primary category: `Medical`

### Screenshots

Minimum recommended set:

- iPhone onboarding
- bio profile
- Texas system search
- request questionnaire
- ID attachment
- signature step
- generated PDF / submission instructions

If iPad support remains enabled, also prepare iPad screenshots.

### Description themes

Description should say:

- Texas-first launch
- search supported Texas hospital systems
- reuse your personal info to fill official request forms
- generate completed request PDFs when a supported form is available
- keep sensitive profile details on device where possible

Description should not say:

- all 50 states
- all hospitals
- automatic portal completion
- diagnosis or treatment support

### Privacy label working draft

This must be confirmed against final shipping behavior, but the initial working assumption is:

Data likely collected off device:

- Name
- Email address
- account identifiers needed for auth/session

Data likely processed only on device unless implementation changes:

- DOB
- last 4 SSN
- phone number
- mailing address
- portal credentials
- binder content
- captured ID photos
- local audio/photo attachments

Important review note:

- if any portal web-view data, DOM content, page history, or uploaded record content is transmitted off device by the shipping build, the privacy answers must be updated accordingly

## Review Notes Package

The Notes for Review field should include:

1. A one-paragraph product summary
   - Texas-first medical-records request assistant
   - not a diagnostic or treatment app
2. Exact login instructions
   - demo account credentials or demo Sign in with Apple path
3. Exact reviewer path
   - sign in
   - complete or use provided bio profile
   - open Home
   - tap Start Records Request
   - search a verified Texas system
   - answer questions
   - generate PDF
4. A short explanation of account deletion
   - Profile -> Account -> Delete Account
5. A note about scope
   - only supported Texas systems are surfaced in this release
6. A note about permissions
   - camera/photo library are for ID capture and binder attachments
   - microphone is for encrypted audio notes in binders

## Release Operations Requirement

App submission is blocked unless the production backend is fresh.

### Pre-submit production gate

On the day of submission:

1. Sync Railway records-workflow Postgres from local source of truth.
2. Sync Railway records-workflow storage artifacts from local source of truth.
3. Deploy current `records-workflow-api` code.
4. Verify search results on production only surface supported Texas systems.
5. Verify at least two Texas systems produce working request packets with supported forms.
6. Verify at least one generated PDF flow end to end on the shipping build.

### During review

If App Review spans multiple days:

- keep Railway data current
- do not allow hospital search to regress into showing unsupported systems
- do not change the reviewer-safe systems without updating review notes

## Acceptance Criteria

The app is ready for App Store submission only when all of the following are true:

- Google login has been made compliant or removed from the binary
- no placeholder or dead-end UI is visible to reviewers
- privacy policy and support URLs exist and are public
- account deletion remains easy to find and functional
- Texas records-request flow works on production against Railway
- only supported Texas systems surface in the records-request search flow
- screenshots and description match the actual release scope
- review notes provide working login credentials and exact steps
- iPad support decision has been resolved

## Recommended Release Order

1. Fix login compliance.
2. Hide or remove placeholder surfaces.
3. Publish privacy policy and support page.
4. Finalize Texas-only metadata and screenshots.
5. Sync Railway from local source of truth.
6. Run final device smoke test on the release build.
7. Submit to App Review.

