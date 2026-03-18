# Telnyx Fax Evaluation Report

**Date**: 2026-03-18  
**Scope**: Evaluate low-cost programmable fax options, validate Telnyx account setup, verify Fax API access, and document current blockers to sending a real test fax.

## Summary

Telnyx appears to be the best price/performance option for low-volume programmable fax, even though the Mission Control portal is clunky and some help-center links are stale.

The main conclusions from live testing on 2026-03-18 are:

- Telnyx bot signup worked end-to-end with email verification and API key creation.
- Fax API access is available on both bot-created and real user-created accounts.
- An outbound-capable Fax Application can be created programmatically.
- A real fax cannot be sent yet from the current account because the standard telecom balance is still `0.00` and there is no purchased fax-capable number.
- AWS does not appear to offer a simple first-party REST-style fax API comparable to Telnyx Fax API. AWS supports SIP/T.38-style fax transport, which is a different category of product.

## Live Validation Performed

### 1. Telnyx bot signup flow works

Telnyx publishes a bot signup flow at:

- `https://telnyx.com/agent-signup.md`

That flow was successfully exercised by:

1. Requesting a PoW challenge from `POST /v2/pow_signup_challenge`
2. Solving the PoW challenge locally
3. Calling `POST /v2/bot_signup`
4. Redeeming the one-time email sign-in link
5. Creating a permanent API key with `POST /v2/api_keys`

Notes:

- Telnyx rejected at least one disposable email provider during signup.
- Telnyx accepted a different disposable inbox provider for testing.
- The real user account was later created using `imyjimmy@gmail.com`.

### 2. Real account signup completed

The real account was created using `imyjimmy@gmail.com`. After the one-time portal link was redeemed, a permanent API key was generated successfully.

### 3. Fax API access is live

The following live calls succeeded against the real account:

- `GET /v2/fax_applications` → `200 OK`
- `GET /v2/faxes` → `200 OK`

Earlier live testing on a bot-created account also succeeded with:

- `POST /v2/fax_applications` → `201 Created`

This is strong evidence that new Telnyx accounts can authenticate to and use the Fax API.

## Current Account State

### Outbound-capable fax resources created

The following resources were created programmatically on 2026-03-18:

- Outbound Voice Profile ID: `2918556997420844326`
- Fax Application ID: `2918557056938018093`
- Fax Application name: `codex-outbound-fax`

The Fax Application is outbound-capable because:

- it has an `outbound.outbound_voice_profile_id`
- it has no assigned inbound phone number
- it has no `sip_subdomain`

This is effectively outbound-only in practice, although Telnyx does not expose an explicit `outbound_only: true` field in the Fax Application schema.

### Placeholder webhook

The Fax Application currently uses a placeholder webhook URL:

- `https://example.com/telnyx/fax-webhooks`

This should be replaced before any real fax event handling is needed.

## Billing Findings

### Standard telecom balance is still zero

Live `GET /v2/balance` calls on the real account returned:

- `balance: 0.00`
- `available_credit: 0.00`
- `pending: 0.00`

This means the account is not currently funded for telecom usage.

### AI credits appear to be separate from telecom balance

The portal indicated `$10` in AI credits after signup, but that amount does not appear in the standard balance API.

What was verified:

- `GET /v2/balance` still shows `0.00`
- `GET /v2/ai/models` works
- `GET /v2/usage_reports/options?product=inference` works and shows `inference` as a separately tracked product

Inference:

- The `$10` shown in the portal is likely an AI-specific promotional credit bucket, not standard prepaid telecom balance.
- No public API endpoint was found that clearly exposes that exact portal-side AI credit amount.

### Manual top-up amount

Telnyx help-center documentation currently indicates:

- minimum payment is `$10 USD`
- a new account can top up up to `$100` on day one

A previously documented hash-route billing URL appears stale:

- `https://portal.telnyx.com/#/app/billing/payment?makeAPayment=true`

In live use, that route redirected to `Page Not Found`.

The newer help-center guidance points users to the portal UI instead:

1. Log into Mission Control
2. Open the profile menu
3. Click `Manage Billing`
4. Open `Billing Overview`
5. Click `Make a Payment`

### No-cost configuration changes succeeded

Creating the following resources did not consume any funds:

- Outbound Voice Profile
- Fax Application

The balance remained `0.00` after those setup calls.

## Fax Testing Findings

### A truly free end-to-end fax test is not possible yet

Because the standard telecom balance is `0.00` and there is no purchased fax-capable number, the current account is not ready to send a real fax.

The remaining blockers are:

1. Add prepaid telecom balance
2. Purchase at least one fax-capable phone number
3. Use that number as the `from` number for outbound faxing

### Lowest-cost real test options

Two candidate test strategies were identified:

#### Option A: One Telnyx number + HP Fax Test Service

Send a one-page PDF to:

- `+18884732963`

HP documents this as a fax test service that sends a return fax within 5 to 7 minutes.

Pros:

- lower cost than buying two numbers
- real interoperability test

Cons:

- depends on third-party behavior
- return-fax behavior may depend on fax header expectations

#### Option B: Two Telnyx numbers, closed loop

Buy two Telnyx fax-capable numbers and send from one to the other.

Pros:

- most deterministic
- entirely under account control

Cons:

- higher cost than the HP path

### Recommendation for eventual paid test

Use Option A first if the goal is the cheapest external validation.  
Use Option B if the goal is the most reliable end-to-end test.

## AWS Comparison

AWS was evaluated as an alternative because of cost concerns around third-party fax services.

Current finding:

- AWS offers fax transport infrastructure via Amazon Chime SDK Voice Connector with T.38 support.
- AWS does not appear to offer a simple first-party cloud fax REST API comparable to Telnyx Fax API.

In practice, AWS solutions in this category skew toward SIP/T.38 infrastructure or expensive partner products, not a lightweight programmable fax API for low-volume testing.

## Practical Recommendation

Stay with Telnyx and minimize portal usage.

The cleanest workflow is:

1. Use the portal only for funding and number purchase
2. Do all Fax API setup programmatically
3. Keep the operational flow scriptable:
   - create or update Fax Application
   - create or update Outbound Voice Profile
   - assign purchased number
   - send test fax via API

This keeps Telnyx's weakest part, the portal UX, off the critical path.

## Suggested Next Steps

1. Add the minimum prepaid telecom balance through Mission Control billing.
2. Purchase one fax-capable number.
3. Replace the placeholder webhook URL if webhook handling is needed.
4. Send a one-page PDF to a low-cost test target.
5. Record the exact API responses and final cost for future automation.

## Sources

- Telnyx bot signup flow: `https://telnyx.com/agent-signup.md`
- Telnyx Fax getting started: `https://developers.telnyx.com/docs/programmable-fax/get-started`
- Telnyx Fax quickstart: `https://developers.telnyx.com/docs/programmable-fax/quickstart`
- Telnyx Fax application API: `https://developers.telnyx.com/api-reference/programmable-fax-applications/creates-a-fax-application`
- Telnyx Fax command API: `https://developers.telnyx.com/api-reference/programmable-fax-commands/send-a-fax`
- Telnyx balance API: `https://developers.telnyx.com/api-reference/billing/get-user-balance-details`
- Telnyx usage reports docs: `https://developers.telnyx.com/docs/reporting/usage-reports`
- Telnyx billing setup help: `https://support.telnyx.com/en/articles/4280500-billing-setup-billing-groups`
- Telnyx account verification help: `https://support.telnyx.com/en/articles/1130595-account-verification`
- HP fax test service: `https://support.hp.com/gb-en/document/ish_2851434-2490344-16`
- AWS Chime SDK features: `https://aws.amazon.com/chime/chime-sdk/features/`
- AWS Marketplace: `https://aws.amazon.com/marketplace/`
