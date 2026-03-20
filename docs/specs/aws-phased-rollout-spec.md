# AWS Phased Rollout Spec for Medical Records Request Assist

Status: Draft
Owner: Limbo Health
Last updated: 2026-03-08

## 1. Purpose

Define a low-risk, AWS-first rollout path for helping users complete and submit hospital medical-record requests (starting with St. David's), while controlling compliance cost and complexity.

This spec separates:

- what is required for a non-PHI MVP (Phase 0)
- what is required once the platform handles PHI in cloud (Phase 1+)

## 2. Scope

In scope:

- iOS-assisted records request workflow for public hospital instructions
- AWS architecture and controls by phase
- server-side fax automation readiness path

Out of scope:

- legal determinations of covered-entity/business-associate status
- portal account automation (OpenClaw layer)
- payer/provider EHR integrations

## 3. Compliance Design Principle

Treat user-submitted authorization forms and driver licenses as sensitive health + identity data. If cloud systems process that data, enable HIPAA-ready controls before launch.

Important:

- HIPAA has no official product certification.
- The operational requirement is contractual and procedural: BAA(s) + safeguards.

## 4. Phase Plan

## Phase 0: Non-PHI Validation (recommended first)

Goal:

- prove user demand and completion rates before taking on cloud PHI handling.

User flow:

1. App guides user through St. David's instructions.
2. App helps user fill/prepare authorization documents locally.
3. User submits via their own channel (fax app, print/mail, or email) outside Limbo-managed cloud PHI processing.

Cloud data policy:

- store only public hospital workflow data and aggregate product analytics.
- do not upload/store user authorization forms, IDs, or medical content in backend.

Exit criteria:

- measurable completion funnel and conversion baseline.
- evidence that users can complete requests with guidance-only workflow.

## Phase 1: HIPAA-Ready Document Intake

Goal:

- secure cloud intake for signed authorization + photo ID.

Adds:

- encrypted file upload pipeline
- PHI retention/deletion policy enforcement
- access audit trails
- incident response runbook

Exit criteria:

- security control checklist complete
- internal compliance review complete
- successful end-to-end dry run with test documents

## Phase 2: Automated Fax Dispatch

Goal:

- one-click dispatch from app backend to hospital fax endpoints.

Adds:

- fax provider integration
- delivery status tracking and retry model
- immutable submission receipts

Exit criteria:

- successful fax delivery confirmation coverage target met
- operational alerting for failed dispatches

## Phase 3: Connect Health Orchestration (optional)

Goal:

- scale guided support via voice/chat verification and agent workflows.

Adds:

- Amazon Connect / Connect Health orchestration
- agent handoff and structured case state
- patient verification automation

Exit criteria:

- support load justifies operating cost
- SLA and quality metrics stable

## 5. Phase 0 AWS Requirements (Detailed)

This section defines what is required on AWS for Phase 0.

## 5.1 Required (must have)

1. AWS account boundary

- use a dedicated account/workload for Phase 0.
- classify environment as non-PHI.

2. API hosting for public workflow service

- host `records-workflow-api` on AWS (ECS/Fargate, EC2, or equivalent).
- enforce TLS in transit.

3. Database for public reference data

- Postgres for hospital systems, facilities, workflows, forms, contacts, and sources.
- no user medical documents in this phase.

4. Object storage for crawler artifacts

- S3 allowed for raw HTML/PDF snapshots from public hospital pages only.
- crawler outputs must remain public-source-derived content.

5. IAM and access baseline

- least-privilege IAM roles for runtime, crawler, and admin tasks.
- remove long-lived shared credentials.

6. Logging and monitoring baseline

- centralized service logs.
- basic health alarms for API uptime and crawl failures.
- ensure logs do not contain uploaded PHI payloads (none should exist in Phase 0).

7. Secret management

- store DB credentials/API secrets in AWS-managed secret store.
- no plaintext secrets in repo, images, or compose files.

## 5.2 Explicitly Not Allowed in Phase 0

1. No backend upload endpoint for user driver license images.
2. No backend storage of signed authorization forms.
3. No cloud fax transmission through Limbo infrastructure.
4. No embedding PHI in logs, traces, analytics events, or support tickets.

If any of the above becomes required, transition to Phase 1 controls before release.

## 5.3 Optional but Strongly Recommended in Phase 0

1. AWS Organizations + separate dev/stage/prod accounts.
2. CloudTrail enabled and retained for auditability.
3. KMS-backed encryption defaults for storage and databases.
4. WAF/rate limiting in front of public APIs.
5. Cost budgets and anomaly alerts from day 1.

## 5.4 Phase 0 Cost Profile (Non-PHI)

Primary cost drivers:

1. container runtime (API + crawler jobs)
2. Postgres instance/storage
3. S3 crawler snapshots
4. logs and metrics retention

Cost guardrails:

- one region to start.
- short log retention.
- lifecycle policy for crawler artifacts.
- stop unused non-prod workloads off-hours.

## 6. Phase 1+ Additional Requirements Trigger

Before enabling any backend flow that handles user authorization forms/IDs:

1. legal/compliance review of HIPAA and state-law posture.
2. business associate agreement coverage where required.
3. PHI data classification, retention, deletion, and access-control policy in production.
4. security risk analysis and remediation tracking.
5. documented incident and breach response process.

## 7. St. David's-Specific Workflow Notes

Current target workflow guidance should preserve:

1. portal access may not include complete records.
2. formal request path includes authorization form handling.
3. fax and mail channels are accepted.
4. valid photo ID copy is required with authorization.
5. radiology and birth certificate routing can be separate.

## 8. Implementation Backlog

## Phase 0 backlog

1. harden current records-workflow API deployment on AWS.
2. add data-boundary checks so user docs cannot be ingested.
3. add telemetry for completion-funnel metrics without PHI.
4. add ops dashboard for crawler freshness and extraction quality.

## Phase 1 backlog

1. implement secure upload service with strict MIME and size policy.
2. implement object-level encryption, retention TTL, and delete workflows.
3. add role-based access controls and document access audit logs.
4. add compliance and incident response runbooks.

## Phase 2 backlog

1. integrate HIPAA-ready fax provider.
2. implement dispatch queue, retries, and idempotency keys.
3. persist provider delivery confirmations and expose status API.
4. add user-visible submission receipt timeline.

## 9. Risks and Mitigations

1. Risk: accidental PHI ingestion in Phase 0.
- Mitigation: no upload endpoints, request payload schema guards, log redaction.

2. Risk: cost expansion before proven demand.
- Mitigation: phase gates with explicit conversion thresholds.

3. Risk: fax provider lock-in.
- Mitigation: provider abstraction + normalized dispatch status model.

4. Risk: ambiguous legal role classification.
- Mitigation: early counsel review before Phase 1 launch.

## 10. Decision Gates

Gate A (Phase 0 -> 1):

- user demand validated and non-PHI guidance flow adoption is strong.

Gate B (Phase 1 -> 2):

- secure intake flow stable and compliance checklist complete.

Gate C (Phase 2 -> 3):

- support volume justifies Connect Health operational spend.

## 11. References

- AWS HIPAA Eligible Services Reference: https://aws.amazon.com/compliance/hipaa-eligible-services-reference/
- AWS HIPAA Compliance: https://aws.amazon.com/compliance/hipaa-compliance/
- AWS Artifact FAQ: https://aws.amazon.com/artifact/faq/
