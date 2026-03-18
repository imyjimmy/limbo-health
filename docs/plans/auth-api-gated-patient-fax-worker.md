# Auth-API-Gated Patient Fax Worker

## Summary

- Keep `auth-api` as the only public auth and policy gate. All end-user fax routes live on `auth-api`; the fax worker has no public endpoint, no HTTP listener, and no JWT/Nostr verification code.
- Deploy `auth-api` as part of Terraform-managed AWS infra. Add S3 for PDFs, SQS plus a DLQ for job handoff, and a queue-driven ECS/Fargate fax worker that only trusts SQS messages created by `auth-api`.
- Scope this work to the fax path only. Existing local JWT verification in `mgit-api` and `scheduler-api` is treated as orphaned code and should be handled in a separate cleanup task.

## Key Changes

### Public auth-api routes

- `POST /api/auth/fax/uploads`
  - Requires `Authorization: Bearer <token>`.
  - Verifies the caller in `auth-api`.
  - Enforces patient-only access (`id_roles = 3`).
  - Requires `application/pdf`.
  - Enforces a default 10 MB max file size.
  - Returns `{ objectKey, uploadUrl, expiresAt }`.
- `POST /api/auth/fax/jobs`
  - Requires the same auth.
  - Accepts `{ objectKey, to }`.
  - Requires an `Idempotency-Key` header.
  - Creates a DB row, enqueues an SQS job, and returns `{ jobId, status, to, createdAt }`.
- `GET /api/auth/fax/jobs/:jobId`
  - Returns the current job state only to the patient who created it or to trusted internal callers.
- `POST /api/auth/fax/webhooks/telnyx`
  - Public webhook endpoint with no user auth.
  - Validates the Telnyx webhook secret or signature.
  - Applies idempotent status updates.
  - Triggers PDF deletion on terminal states.

### Data model

- Add a `fax_jobs` table to the shared MySQL schema with:
  - `id`
  - `patient_user_id`
  - `target_fax_number`
  - `s3_object_key`
  - `idempotency_key`
  - `status`
  - `provider`
  - `provider_job_id`
  - `provider_status`
  - `failure_reason`
  - `created_at`
  - `updated_at`
  - `submitted_at`
  - `completed_at`
  - `deleted_at`
- Add a unique key on `(patient_user_id, idempotency_key)` so retries and double-submits return the same job instead of sending a second fax.

### AWS and Terraform

- Extend the Terraform-managed stack to include:
  - public `auth-api` ECS service
  - private S3 bucket for fax PDFs
  - SQS queue plus DLQ
  - `fax-worker` ECS/Fargate service
- Store `TELNYX_API_KEY`, fax app ID, and fax source number in Secrets Manager.
- Give `auth-api`:
  - `JWT_SECRET`
  - DB credentials
  - S3 upload and presign rights
  - SQS send rights
- Give `fax-worker`:
  - DB credentials
  - S3 read and delete rights
  - SQS consume and delete rights
  - Telnyx secrets
- Do not give `fax-worker` `JWT_SECRET`.
- Run `fax-worker` with no ALB, no listener, and no inbound security-group rules. It is a queue consumer only, not an HTTP service.
- For the first cut, place `fax-worker` in the same Terraform-managed network with outbound internet access and zero inbound rules to avoid NAT-only complexity.

### Worker behavior

- Long-poll SQS.
- Load the `fax_jobs` row.
- Generate a short-lived presigned S3 GET URL.
- Call Telnyx with `connection_id`, `from`, `to`, and `media_url`.
- Update the job with the returned provider job ID and initial status.
- Use SQS retries for transient failures.
- Move poison jobs to the DLQ after 5 receives.
- Never accept user tokens, never call `jwt.verify`, and never make auth decisions.

### Retention policy

- Unused uploaded PDFs expire automatically after 24 hours.
- PDFs linked to a fax job are deleted as soon as the job reaches a terminal state (`delivered` or `failed`).
- Add an S3 lifecycle safety net that deletes leftovers within 48 hours.
- Do not store raw JWTs, signed Nostr events, or full webhook payloads in the job table.

## Test Plan

- `auth-api` integration tests for:
  - missing token
  - invalid token
  - non-patient rejection
  - valid patient upload URL issuance
  - invalid MIME rejection
  - oversize rejection
  - idempotent `POST /api/auth/fax/jobs`
  - job-status authorization
- Worker tests for:
  - SQS message parsing
  - Telnyx request shape
  - DB updates
  - retry behavior
  - DLQ behavior after repeated failures
- Webhook tests for:
  - signature or secret validation
  - duplicate webhook delivery
  - out-of-order webhook updates
  - terminal-state deletion of the S3 object
- Infra validation for:
  - no public route to `fax-worker`
  - `fax-worker` task definition does not include `JWT_SECRET`
  - `auth-api` can publish to SQS
  - worker can read S3 and reach Telnyx
- End-to-end staging test:
  - patient uploads a sample PDF
  - `auth-api` queues the job
  - worker submits to Telnyx
  - job status becomes visible through `GET /api/auth/fax/jobs/:jobId`
  - PDF is removed after the job finishes

## Assumptions And Defaults

- V1 is patient-only.
- `auth-api` remains the sole verifier for Google, Nostr, and app JWT credentials.
- The fax worker trusts only AWS IAM, SQS, and DB state.
- Existing orphaned JWT verification in `mgit-api` and `scheduler-api` is not removed by this task. Create a separate follow-up task to prove those paths are unused and then delete them.
- The plan assumes one PDF per fax job, one destination fax number per job, and one configured Telnyx outbound fax application and number.
- This design follows the desired future boundary more strictly than the current rest-of-stack state, where some sibling services still contain local JWT verification helpers.

## References

- AWS S3 presigned uploads: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html>
- Amazon API Gateway quotas: <https://docs.aws.amazon.com/general/latest/gr/apigateway.html>
- Telnyx Programmable Fax getting started: <https://developers.telnyx.com/docs/programmable-fax/get-started>
