# User-Assisted Hospital Portal Login Spec

**Status:** Draft
**Owner:** Limbo Health
**Last updated:** 2026-03-22

## 1. Purpose

Define an iOS-first, user-assisted portal access feature that helps a patient:

- register for a hospital or clinic portal
- generate and store portal credentials locally when the app assists with registration
- save portal credentials locally on device
- log back in with biometric-gated credential fill
- navigate the portal after login
- extract and summarize messages, labs, appointments, and other read-only portal content

This spec is intentionally scoped around **user-assisted access**, not fully autonomous cloud-side account automation.

## 2. Product Summary

The Limbo Health mobile app should offer a built-in portal browser powered by `react-native-webview` on iOS, which uses `WKWebView` under the hood.

The user remains present for the parts that require a real human:

- CAPTCHA
- one-time passcodes
- passkeys / WebAuthn
- password reset flows
- terms / consent checkboxes that require explicit acknowledgment
- any portal flow the app cannot confidently interpret

The app handles the assistive parts:

- opening the right registration or login page
- recognizing known portal layouts
- helping the user create credentials
- generating a strong password during app-assisted registration when appropriate
- saving credentials in the iOS Keychain
- unlocking saved credentials with Face ID / Touch ID
- filling login forms on behalf of the user after biometric approval
- navigating within the authenticated session while the app is in the foreground
- extracting structured read-only data for summaries and binder import

## 3. Design Principles

### 3.1 User-assisted, not deceptive

The app should behave like an on-device copilot, not a secret remote bot.

- The user should understand when the app is viewing or driving a portal page.
- The app should make human-required steps obvious and easy to resume.
- The app should not claim to bypass portal security controls.

### 3.2 Local-first for credentials and active sessions

Portal credentials are more sensitive than ordinary app settings.

- Credentials must be stored only in device-local secure storage.
- Raw credentials must never be sent to Limbo servers.
- Active portal session control should happen on device inside the app-owned webview.

For app-assisted registrations, the app may generate and retain the portal password on the user's device so the user does not need to type it on future logins or memorize it. For pre-existing portal accounts, the user may need to enter their credentials once so the app can save them locally for future biometric login assistance.

### 3.3 Read-first automation

The system should strongly prefer read-only actions:

- open inbox
- open labs
- open appointments
- capture visit summaries
- download or parse visible documents

Write actions should require more friction and explicit user approval.

### 3.4 Predictable over clever

Known portal families should use deterministic adapters, not freeform agentic behavior.

- MyChart, Athena, NextGen, eClinicalWorks, etc. should each have explicit selectors and action maps where possible.
- Unknown portals may fall back to generic assist mode, but that mode should be visibly less automated.

### 3.5 Human attention is a feature, not a failure

The product should assume that some healthcare portal steps must remain human-in-the-loop. That is acceptable and expected.

## 4. Scope

In scope:

- iOS-first portal registration and login assistance
- credential save and biometric unlock
- portal navigation inside an app-owned webview
- post-login extraction of read-only patient data
- portal-specific adapters
- human-in-the-loop interruption handling
- native summaries and binder import handoff

Out of scope:

- server-side storage of portal passwords
- hidden background crawling after the app is suspended
- unsupervised bypass of CAPTCHA or MFA
- portal write actions by default
- acting as a general-purpose browser outside supported portal use cases

## 5. Core User Flows

### 5.1 Add a portal

1. User chooses "Add portal".
2. App asks the user to search or choose a health system.
3. App opens the best-known registration or login URL in the in-app portal browser.
4. App detects whether the destination is:
   - sign up
   - log in
   - account recovery
   - MFA challenge
   - unsupported / unknown
5. App switches into the corresponding assist mode.

### 5.2 Registration flow

The app helps the user register but does not pretend registration is fully automatable.

Registration assistance can include:

- highlighting required fields
- pre-filling known profile data when appropriate
- generating or suggesting a strong password
- storing the final username/password locally once account creation succeeds
- offering to reveal, copy, or export the generated password to the user if they want a personal record of it
- saving the final username/password locally once account creation succeeds
- detecting when registration has transitioned into a logged-in session

The user remains responsible for:

- identity proofing questions
- verification emails or SMS codes
- CAPTCHA
- provider-specific consent text

For app-assisted registrations, the default assumption is that the app will have the saved password locally after the flow completes. The user should not be required to memorize that password in order to keep using the portal through Limbo.

### 5.3 Existing account import

If the patient already created a portal account before using Limbo, the app should support a one-time credential import flow.

Recommended behavior:

1. User opens the portal login page in the in-app browser.
2. User manually enters their existing username and password once.
3. After successful login, the app offers to save those credentials locally.
4. On future logins, the user can use biometric unlock instead of retyping the credentials.

The product should frame this as a one-time setup cost for existing accounts, not as the normal recurring login experience.

### 5.4 First successful login

1. User reaches a login screen inside the in-app webview.
2. If credentials are not yet saved, the user types them manually.
3. Once login succeeds, the app offers to save those credentials.
4. Credentials are stored in Keychain with biometric-gated read access.
5. The app records a portal profile locally:
   - portal family
   - health system name
   - login URL
   - username label
   - credential storage key
   - last successful login timestamp
   - known post-login landing destinations

### 5.5 Returning login

1. User opens a saved portal.
2. App loads the login page in the portal browser.
3. App offers `Unlock and fill`.
4. User authenticates with Face ID or Touch ID.
5. App retrieves stored credentials from Keychain.
6. App injects credentials into the page and dispatches the required DOM events.
7. If the portal adapter marks the form as safe to auto-submit, the app submits the form.
8. If the portal presents CAPTCHA, MFA, or another challenge, the app pauses and asks the user to complete that step.

For portals originally created through app-assisted registration, the user should normally never need to type or remember the password again unless they explicitly rotate it or remove it from secure storage.

### 5.6 Post-login assist mode

After successful login, the user does not need to keep the portal page fully front-and-center at all times.

While the app remains in the foreground, it may:

- keep the authenticated webview alive
- minimize or visually de-emphasize the webview
- issue navigation commands into that live session
- extract page data and show native results screens

If the portal needs human attention, the app should restore the live portal view prominently and explain the required action.

### 5.7 Human-in-the-loop interruptions

The app must pause automation and request user action for:

- CAPTCHA
- SMS, email, authenticator, or phone-call OTP
- passkey / WebAuthn prompts
- password reset
- security questions
- consent acknowledgments
- portal error screens the adapter cannot classify

## 6. Functional Requirements

### 6.1 Portal browser shell

The app must provide a dedicated portal browser screen built on `react-native-webview`.

Required capabilities:

- load known portal URLs
- observe URL changes
- observe page titles
- inject JavaScript before and after page load
- receive structured JS-to-native messages
- maintain cookies and storage for the logged-in session
- expose a visible "take over" mode when the user needs full manual control

### 6.2 Credential vault

Portal credentials must be stored separately from Limbo account auth.

Required behavior:

- store credentials in iOS Keychain via the existing secure storage pattern
- gate reads behind Face ID or Touch ID
- use `ThisDeviceOnly`-style accessibility semantics
- store a non-secret sentinel for "credential exists" checks that do not trigger biometrics
- support update, delete, and rotate flows
- support reveal or export of a saved/generated password after biometric confirmation when the user explicitly requests it

Each saved credential record should include:

- portal profile id
- username
- password
- optional notes such as "username is email"
- created at
- last used at
- last verified at

Raw credentials must never be logged, synced, or exported.

Exception:

- if the user explicitly requests to view or copy their saved/generated portal password, the app may reveal it locally after biometric confirmation
- that reveal action must be treated as a deliberate user action, not part of automatic login

### 6.3 Assisted form fill

The app must be able to inject credentials and known profile data into supported login and registration pages.

Required behavior:

- use portal-family selectors when available
- fall back to safer generic field detection only when confidence is high
- dispatch the same input and change events a real user would trigger
- avoid filling fields the app cannot confidently classify
- avoid cross-origin frame injection when access is blocked

### 6.4 Session steering

Once authenticated, the app should expose a command layer that can steer the webview session.

Examples:

- `openMessages`
- `openLabs`
- `openAppointments`
- `openVisitSummaries`
- `search("A1C")`
- `downloadCurrentDocument`

Commands should map to deterministic adapter actions:

- direct URL loads when stable
- DOM clicks when stable
- menu expansion and selection when necessary
- explicit wait conditions for navigation completion

### 6.5 Extraction and interpretation

The app should be able to extract structured or semi-structured content from the active portal page.

Initial extraction targets:

- inbox and message threads
- upcoming and past appointments
- lab lists and individual result views
- visit summaries and after-visit documents
- medications list when easy to detect

The extraction layer should return normalized records that can feed:

- native detail screens
- binder import candidates
- LLM summarization

### 6.6 Read-only default

The app should default to read-only assistance after login.

Allowed by default:

- navigation
- data extraction
- downloading documents
- showing summaries

Not allowed by default:

- sending portal messages
- canceling appointments
- changing profile information
- paying bills
- editing insurance or demographic data

Any write action should require a separate product decision and explicit confirmation flow.

## 7. UX Requirements

### 7.1 iOS-first presentation

The experience should feel like a native iOS flow, not a browser stuffed into a screen.

Recommended presentation:

- a native header with portal name, status, and escape hatch
- a prominent assist banner explaining what the app is doing
- native cards for suggested next actions
- a sheet or bottom panel for human-required interruptions

### 7.2 Registration and login assistance copy

The UI should consistently frame the feature as assistance:

- "We'll help you fill this in."
- "Use Face ID to unlock and fill your saved login."
- "This step requires you to complete the security check."
- "You're back in. We can open labs, messages, or appointments next."

Avoid misleading copy such as:

- "We log in for you without any action."
- "We bypass security."

### 7.3 Hidden webview behavior

After login, the webview may be visually minimized or hidden behind native surfaces while the app stays active in the foreground.

Requirements:

- the app must still provide a way to reopen the live portal page instantly
- the app must surface when it is still using a live portal session
- the app must not imply background persistence after the app is suspended

### 7.4 Failure states

The app must clearly explain:

- why automation paused
- what the user needs to do
- whether saved credentials are still valid
- whether the session expired
- whether the portal layout is unsupported

## 8. Human-in-the-Loop Policy

### 8.1 Mandatory handoff cases

The app must stop and ask for explicit user action when:

- a CAPTCHA is present
- an OTP input is detected
- a passkey or security key challenge appears
- the page requests identity verification
- a legal acknowledgment or consent step appears
- the adapter confidence falls below threshold

### 8.2 Resume behavior

After the user completes the blocking step, the app should:

- detect the new page state
- announce that it can continue
- resume navigation only from a known-safe checkpoint

### 8.3 Escalation path

If the app fails to recover after repeated attempts, it should offer:

- manual browsing mode
- a "save this portal as unsupported for now" state
- optional feedback capture for future adapter improvement

## 9. Technical Architecture

### 9.1 Main components

Recommended mobile architecture:

- `PortalBrowserScreen`
- `PortalSessionController`
- `PortalCredentialVault`
- `PortalAdapterRegistry`
- `PortalAssistBridge`
- `PortalExtractionService`
- `PortalSummaryService`

### 9.2 Responsibilities

`PortalBrowserScreen`

- owns the visible portal experience
- hosts the webview
- shows native assist overlays and interruption prompts

`PortalSessionController`

- tracks session phase:
  - loading
  - login
  - registration
  - challenge
  - authenticated
  - unsupported
- issues navigation and DOM commands
- manages retries and timeouts

`PortalCredentialVault`

- reads and writes portal credentials in Keychain
- requires biometrics for credential release
- exposes non-secret existence checks

`PortalAdapterRegistry`

- resolves a portal family from URL and page markers
- returns selectors, command maps, and extraction rules

`PortalAssistBridge`

- injects JS into the webview
- collects DOM snapshots or structured page facts
- reports events back to React Native

`PortalExtractionService`

- maps raw page facts to normalized records

`PortalSummaryService`

- summarizes extracted records for the user
- should operate on extracted text, not raw credentials

### 9.3 Adapter model

Each adapter should define:

- portal family id
- hostname patterns
- login field selectors
- registration hints
- challenge detection rules
- primary navigation actions
- extraction recipes for messages, labs, appointments

Adapters should be versioned so that layout fixes can be rolled out safely.

### 9.4 Foreground-only assumption

The architecture must assume that active webview steering is a foreground feature.

- The app may keep a hidden or minimized authenticated webview while active.
- The app must not depend on long-running hidden browser automation after background suspension.
- If long-running downloads are needed, they should be handed off to supported native transfer mechanisms where possible.

## 10. Data Model

### 10.1 Portal profile

Each saved portal connection should include:

- `id`
- `health_system_name`
- `portal_family`
- `display_name`
- `base_url`
- `login_url`
- `registration_url`
- `username_hint`
- `credential_key`
- `last_successful_login_at`
- `last_verified_at`
- `status`

### 10.2 Session state

Session state should include:

- `portal_profile_id`
- `phase`
- `current_url`
- `page_title`
- `is_human_required`
- `human_required_reason`
- `last_adapter_action`
- `last_activity_at`

### 10.3 Extracted record model

Initial normalized content should support:

- `portal_message`
- `portal_lab_result`
- `portal_appointment`
- `portal_visit_summary`

Each record should capture:

- source portal profile id
- canonical type
- title
- timestamp
- source URL
- extracted text
- structured fields where available
- extraction confidence

## 11. Security and Privacy Requirements

### 11.1 Credentials

- Portal credentials must remain device-local.
- Credentials must be biometric-gated for release.
- Credentials must not be written to analytics, logs, crash reports, or clipboard.

### 11.2 Session data

- Session cookies and local storage should remain inside the webview's storage container on device.
- The app must not export cookies to the backend.
- The app should clear session state when the user disconnects a portal or requests logout.

### 11.3 Cloud boundary

The backend may receive extracted and user-approved portal content in later phases, but must never receive:

- raw usernames and passwords
- raw OTPs
- portal session cookies
- hidden DOM dumps by default

### 11.4 Auditability

The app should record a local audit trail for major portal actions such as:

- credential saved
- credential used after biometric unlock
- portal login succeeded
- portal login failed
- human-required challenge encountered
- records extracted

This audit trail must itself avoid storing secrets.

## 12. MVP Requirements

MVP should support:

- one or two portal families with deterministic adapters
- add portal
- save credentials after successful login
- biometric-gated credential fill
- human handoff for CAPTCHA / MFA
- post-login navigation to messages, labs, and appointments
- extraction of those three content types
- native summary cards after extraction

MVP should not require:

- broad portal-family coverage
- write actions
- fully hidden automation
- server-side orchestration

## 13. Success Metrics

Primary metrics:

- successful portal connection rate
- successful returning login rate
- biometric unlock to authenticated session success rate
- challenge recovery success rate
- extraction success rate for messages, labs, and appointments

Secondary metrics:

- time from portal open to first useful data
- number of manual takeovers per session
- credential save adoption
- portal-specific failure clusters

## 14. Risks

### 14.1 Portal instability

Healthcare portals change markup often. Adapter maintenance is an ongoing product cost.

### 14.2 Anti-bot defenses

Some portals may aggressively interrupt automation with CAPTCHA, MFA, or traffic analysis. User-assisted positioning reduces this risk but does not eliminate it.

### 14.3 App Review perception

The product must be framed and implemented as user-authorized assistance inside the app, not covert credential harvesting or deceptive browser automation.

### 14.4 False confidence

The app must never imply that a saved portal is guaranteed to work unattended. Human-required interruptions are a normal part of the feature.

## 15. Open Questions

1. Which portal families should Limbo support first?
2. Should the app auto-submit login forms after biometric fill, or fill-only by default for v1?
3. Should extracted portal content be binder-importable immediately, or review-only at first?
4. Should the portal browser live inside the current records-request area, or become its own top-level product area?
5. Do we want a local-only first release before any cloud-backed summaries or sync?

## 16. Repo Alignment

This spec should build on the current mobile foundations already present in the repo:

- React Native / Expo mobile shell in `apps/react-native`
- `react-native-webview` already installed
- `expo-secure-store` already installed
- existing biometric-gated key access patterns in `apps/react-native/core/crypto/KeyManager.ts`
- existing records-request workflow surfaces that can later link into portal help

The preferred implementation shape is to reuse the current secure-storage and iOS-first UX patterns rather than introducing a separate server-driven OpenClaw-style control plane for v1.
