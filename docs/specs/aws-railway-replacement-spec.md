# Limbo Health Spec: Replace Railway with AWS (Lean-First)

## 1. Goal
Move Limbo Health off Railway and onto AWS using the cheapest architecture I would still consider production-credible for an early-stage product.

The default target in this document is not ECS, Fargate, ALB, EFS, or dual managed databases.

The default target is:
- one EC2 instance
- one EBS volume
- one PostgreSQL database running on that instance
- Docker Compose for all app services
- S3 for backups

This document intentionally treats the larger AWS platform as optional future infrastructure, not day-1 infrastructure.

## 2. Why This Version Exists
The earlier AWS migration write-up was directionally fine, but it was too “enterprise by default.”

That was the wrong emphasis for this project.

The current repo does have multiple services and significant filesystem needs:
- `mgit-api` needs writable repo storage
- `scheduler-api` serves uploads
- `records-workflow-api` serves a broader on-disk storage tree of accepted forms, parsed artifacts, templates, and targeted pages

But none of that automatically means Limbo Health should begin on:
- ECS/Fargate
- ALB
- NAT gateways
- EFS
- Multi-AZ RDS for two database engines

Those are valid later steps.

They are not the cheapest sane first step.

## 3. Current Repo Constraints

### 3.1 Current service inventory
From the codebase today:
- `auth-api`
- `mgit-api`
- `scheduler-api`
- `records-workflow-api`
- `frontend`
- `gateway`
- `records-workflow-postgres`

The current production composition is visible in [docker-compose.production.yml](/Users/imyjimmy/dev/pleb-emr/limbo-health/docker-compose.production.yml).

### 3.2 Current database reality
Today the checked-in runtime is aligned on one shared PostgreSQL database:
- `auth-api` uses PostgreSQL through the shared compat layer
- `scheduler-api` uses PostgreSQL through the shared compat layer
- `records-workflow-api` uses PostgreSQL natively

Evidence:
- [server.js](/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/auth-api/server.js)
- [database.js](/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/scheduler-api/config/database.js)
- [schema.sql](/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/db/schema.sql)

### 3.3 Why the lean target prefers PostgreSQL
If the project moves to one database, PostgreSQL is the better unification target.

Reason:
- `records-workflow-api` is already Postgres-native
- it uses `jsonb`
- it uses `gen_random_uuid()`
- it uses Postgres-specific query features such as `ILIKE`, `DISTINCT ON`, `ANY($1)`, `RETURNING`, and `::int`

Evidence:
- [schema.sql](/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/db/schema.sql)
- [workflowRepository.js](/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/src/repositories/workflowRepository.js)

So this spec assumes a lean target state of:
- one PostgreSQL database
- not one MySQL database

### 3.4 Filesystem requirements we must preserve
Limbo Health currently has real disk-backed needs:
- MGit repositories
- MGit user metadata
- scheduler uploads
- records-workflow pipeline artifacts under `/app/storage`

Relevant runtime paths:
- `/repos`
- `/app/users`
- `/app/uploads`
- `/app/storage`

These are currently easier and cheaper to keep on one EC2-attached EBS volume than to split across EFS or object storage on day 1.

## 4. Recommended Lean Architecture

This is the main recommendation.

### 4.1 Compute
Use one EC2 instance in `us-east-1`:
- preferred start size after DB unification: `t4g.medium`
- safe fallback if DB unification is delayed: `t4g.large`

Reasoning:
- a single box is enough for current scale if traffic is still modest
- Graviton keeps cost low
- Docker Compose is simpler than ECS for this project right now

### 4.2 Networking
Keep networking simple:
- one VPC
- one public subnet
- one EC2 instance with an Elastic IP
- security group allows `80` and `443`
- do not expose `22`; use SSM Session Manager for shell access

This avoids:
- ALB hourly cost
- NAT gateway cost
- private-subnet complexity

### 4.3 Runtime layout on the EC2 host
Run these containers on the same EC2 instance:
- reverse proxy (`caddy` or `nginx`)
- `frontend`
- `auth-api`
- `scheduler-api`
- `mgit-api`
- `records-workflow-api`
- `postgres`

The current `gateway` container is not required in this lean target.

Instead:
- the box-level reverse proxy handles TLS and routing
- the application containers stay private on the Docker network

### 4.4 Storage
Attach one gp3 EBS volume to the instance and mount it at a stable host path such as:

```text
/srv/limbo-data
```

Suggested directory layout:

```text
/srv/limbo-data/records-workflow-postgres
/srv/limbo-data/repos
/srv/limbo-data/users
/srv/limbo-data/uploads
/srv/limbo-data/records-workflow-storage
```

Container mounts:
- Postgres data -> `/srv/limbo-data/records-workflow-postgres`
- MGit repos -> `/srv/limbo-data/repos`
- MGit user metadata -> `/srv/limbo-data/users`
- scheduler uploads -> `/srv/limbo-data/uploads`
- records-workflow storage -> `/srv/limbo-data/records-workflow-storage`

Why EBS and not EFS on day 1:
- cheaper
- simpler
- better fit for a single-host deployment
- no shared-filesystem need yet

### 4.5 Database
Target state:
- one PostgreSQL instance running on the EC2 host as a container

This is the cleanest way to reach the lowest ongoing AWS cost.

### 4.6 Public ingress and TLS
Day-1 lean ingress:
- Route 53 points `limbo.health` to the instance Elastic IP
- `caddy` or `nginx` terminates TLS on the instance

Recommendation:
- use `caddy` with Let’s Encrypt for the lean phase

Why this is the right day-1 choice:
- avoids ALB cost
- avoids ACM + ALB dependency
- keeps routing simple

Later, if the project needs AWS-native managed TLS and multi-instance ingress, move to:
- ALB
- ACM

That is not required for the first AWS migration.

### 4.7 Backups
Use S3 for backups only.

Minimum backup set:
- nightly `pg_dump`
- nightly compressed backup of:
  - `/srv/limbo-data/repos`
  - `/srv/limbo-data/users`
  - `/srv/limbo-data/uploads`
  - `/srv/limbo-data/records-workflow-storage`
- regular EBS snapshots

Backups should be encrypted and retained with a simple lifecycle policy.

### 4.8 Observability
Minimum AWS operational layer:
- CloudWatch agent on the EC2 instance
- basic application logs written to local files or container stdout
- CloudWatch alarms for:
  - CPU
  - memory
  - disk usage
  - instance status checks
  - backup failures

Do not overbuild observability on day 1.

### 4.9 Secrets and access
Use:
- SSM Parameter Store for non-secret config
- Secrets Manager for secrets only if needed
- SSM Session Manager instead of SSH

This keeps the lean environment simple while still using reasonable AWS primitives.

## 5. Expected Monthly Cost

These numbers are approximate and should be rechecked before purchasing, but the lean target is intentionally small.

As of March 17, 2026 in `us-east-1`, the lean target is roughly:
- EC2 `t4g.medium`: about `$24.53/mo`
- 100 GB gp3 EBS: about `$8/mo`
- public IPv4 / Elastic IP: about `$3.65/mo`
- Route 53 and light operational overhead: about `$5-$10/mo`

So the steady-state target is roughly:
- **`$40-$50/mo`** after PostgreSQL unification

Transitional variant if MySQL and PostgreSQL both remain on the host:
- use `t4g.large`
- expected range: roughly **`$65-$80/mo`**

The point of this spec is to keep the project much closer to the first number than the second.

## 6. Lean Migration Plan

### 6.1 Preferred end state
Preferred end state:
- one EC2 host
- one PostgreSQL database
- one EBS volume
- one reverse proxy
- S3 backups

### 6.2 Migration order
Recommended order:
1. Create the AWS account resources for the lean target.
2. Provision the EC2 instance, Elastic IP, EBS volume, S3 backup bucket, and Route 53 zone records.
3. Build the Docker Compose deployment for the EC2 host.
4. Mount EBS and wire persistent directories.
5. Deploy the app in transitional form if necessary.
6. Import application data.
7. Import records-workflow PostgreSQL data.
8. Copy repos, uploads, and records raw artifacts to the EBS volume.
9. Validate all public routes.
10. Cut DNS to AWS.
11. Remove MySQL later if the app has not yet been ported to PostgreSQL.

### 6.3 Transitional option if the one-DB refactor is not ready
If the project needs to leave Railway quickly, do this first:
- keep the single-EC2 design
- run both MySQL and PostgreSQL locally on that EC2 box
- migrate to AWS with minimal code changes
- then port app data/services to PostgreSQL in a second wave

That keeps the infrastructure cheap while avoiding an all-at-once application rewrite.

### 6.4 Data import requirements
The lean migration still needs to preserve all state:
- app user/business data
- records-workflow data
- Git repositories
- scheduler uploads
- records raw HTML/PDF artifacts

For the lean target, all filesystem state lands on the EBS volume, not EFS.

### 6.5 Route contract to preserve
The AWS environment must preserve:
- `/api/auth/*`
- `/api/mgit/*`
- `/api/webrtc/*`
- `/api/*`
- `/api/records-workflow/*`
- `/v1` and `/v1/*` return `410 Gone`

### 6.6 records-workflow expectations
The lean architecture must still preserve:
- PostgreSQL metadata for hospital systems, workflows, forms, and source documents
- filesystem-backed cached PDFs/HTML at the existing path contract
- public read access to `/api/records-workflow/*`

The records crawler should remain disabled by default on day 1.

The initial lean target is:
- read API on
- crawler off

## 7. Day-1 Operational Baseline

### 7.1 Host sizing
Start with:
- `t4g.medium` if the app has already unified to PostgreSQL
- `t4g.large` if MySQL and PostgreSQL both remain during the transition

### 7.2 Patch and restart policy
Keep this simple:
- monthly OS patch window
- Docker image updates on controlled deploys
- documented restore path from S3 backups and EBS snapshots

### 7.3 Backup policy
Minimum:
- nightly logical Postgres backup to S3
- daily or scheduled EBS snapshot
- nightly archive of repos/uploads/raw to S3 if those directories change frequently

### 7.4 Alarm policy
Create alarms for:
- EC2 `CPUUtilization`
- memory usage from the CloudWatch agent
- disk usage on `/srv/limbo-data`
- instance status check failures
- backup job failures
- HTTP `5xx` spikes from the reverse proxy logs if available

### 7.5 What this architecture intentionally accepts
This lean target intentionally accepts:
- a single compute node
- brief maintenance windows during host-level work
- instance-level TLS termination
- more hands-on system administration than ECS/Fargate

Those are acceptable tradeoffs for the cost target.

## 8. Acceptance Criteria
- `https://limbo.health` is served from AWS
- all current public route families work
- `/v1` and `/v1/*` return the expected `410`
- web and mobile flows function against AWS
- records-workflow hospital list and packet endpoints work
- cached records-workflow artifacts are readable from disk-backed storage
- MGit repos are intact and writable
- scheduler uploads are intact and readable
- backups run and are restorable
- Railway can be turned off after a soak period

## 9. Appendix A: Standby AWS Assets For Scale

This section is intentionally appendix-like.

These AWS services are not part of the day-1 lean target, but they are the correct next assets to introduce once the project crosses specific operational thresholds.

### 9.1 Add larger EC2 first
Trigger metrics:
- average EC2 CPU over `60%` for 15 minutes during normal peaks
- memory over `75%` for 15 minutes
- any recurring OOM kill
- load average persistently near or above vCPU count

Action:
- resize from `t4g.medium` to `t4g.large` or `t4g.xlarge`

Why first:
- cheapest scale action
- smallest architectural change

### 9.2 Move PostgreSQL to RDS PostgreSQL
Trigger metrics:
- Postgres is the main source of host pressure
- DB CPU consumes more than roughly `40%` of total instance capacity during peak
- database connections exceed `70%` of configured max during peak
- p95 query latency becomes a recurring product issue
- backups/restores on the app host become operationally risky

Action:
- move the PostgreSQL database to `RDS PostgreSQL` Single-AZ first

AWS assets added:
- `RDS PostgreSQL`
- DB subnet group
- DB security group

### 9.3 Move the frontend to S3 + CloudFront
Trigger metrics:
- static asset traffic is materially consuming instance CPU or bandwidth
- frontend deploys should be isolated from API deploys
- global/static delivery performance becomes a priority

Action:
- host the built frontend in `S3`
- serve it via `CloudFront`

AWS assets added:
- `S3`
- `CloudFront`
- optionally `ACM` on CloudFront

### 9.4 Add ALB and ACM
Trigger metrics:
- one-instance TLS termination is no longer acceptable
- zero-downtime deploys become important
- you need cleaner blue/green or rolling cutovers
- there is a need to route traffic across multiple compute nodes

Action:
- add `Application Load Balancer`
- move TLS certificates to `ACM`

AWS assets added:
- `ALB`
- `ACM`
- target groups

### 9.5 Add a second EC2 instance and Auto Scaling Group
Trigger metrics:
- p95 API latency remains high even after resizing one instance
- one-instance outages are no longer acceptable
- deploy-time downtime exceeds the tolerated outage budget

Action:
- move to two app instances behind the ALB
- use an `Auto Scaling Group` with a desired count of `2`

AWS assets added:
- `Auto Scaling Group`
- launch template
- health checks through the ALB

### 9.6 Introduce EFS only when shared writable storage is required
Trigger metrics:
- app compute must run on more than one instance
- the same writable data must be mounted by multiple instances
- repos/uploads/records-workflow data outgrow practical single-volume operations

Action:
- move shared writable paths to `EFS`

Likely directories:
- `/repos`
- `/app/users`
- `/app/uploads`
- `/app/storage`

AWS assets added:
- `EFS`
- mount targets
- access points

### 9.7 Move containers to ECR + ECS
Trigger metrics:
- Docker Compose on one or two hosts becomes operationally messy
- different services need different scaling behavior
- deploy tooling needs better isolation and rollback

Action:
- publish images to `ECR`
- run services on `ECS`

Recommendation:
- prefer `ECS on EC2` before `Fargate` if cost is still the priority

Why:
- it preserves lower-cost compute while giving container orchestration

### 9.8 Move to Fargate only when ops simplicity matters more than cost
Trigger metrics:
- the team wants per-service autoscaling with less host management
- patching EC2 hosts is no longer worth the engineering time
- service count and release cadence justify managed orchestration overhead

Action:
- move ECS services from EC2-backed capacity to `Fargate`

This is a later-stage decision, not an early-stage default.

### 9.9 Split background work with SQS and EventBridge
Trigger metrics:
- crawler jobs or Git-heavy jobs interfere with interactive request latency
- background tasks need retry semantics or scheduled execution

Action:
- push asynchronous work behind `SQS`
- trigger scheduled work with `EventBridge`
- run workers separately from the main app container(s)

AWS assets added:
- `SQS`
- `EventBridge`
- optional worker service on EC2, ECS, or Fargate

### 9.10 Add ElastiCache only if database or session pressure justifies it
Trigger metrics:
- repeated hot reads are creating avoidable DB load
- rate limiting, session storage, or derived cache data is needed

Action:
- add `ElastiCache Redis`

Do not add Redis early without a measured reason.

## 10. Appendix B: Metric Thresholds Summary

These thresholds are judgment calls based on standard AWS operations practice and should be tuned once real production traffic exists.

### 10.1 EC2
- CPU alarm: `> 60%` sustained for 15 minutes
- memory alarm: `> 75%` sustained for 15 minutes
- disk usage alarm: `> 70%`
- critical disk alarm: `> 85%`
- instance status check failures: any non-zero

### 10.2 Application
- p95 API latency target: stay below `500 ms`
- investigate if p95 exceeds `500 ms` during normal load
- take scaling action if p95 exceeds `800 ms` repeatedly
- investigate if HTTP `5xx` exceeds `1%`

### 10.3 PostgreSQL
- investigate if DB connections exceed `70%` of max
- investigate if DB activity is the main source of host CPU pressure
- move to RDS when DB growth makes backups/restores or host contention uncomfortable

### 10.4 Storage
- investigate at `70%` EBS usage
- take action before `85%`
- reevaluate EBS-only storage if repos/uploads/records-workflow growth or multi-instance requirements become real

## 11. Sources Used For Cost Framing
- [Amazon EC2 On-Demand Pricing](https://aws.amazon.com/ec2/pricing/on-demand/)
- [Amazon EBS Pricing](https://aws.amazon.com/ebs/pricing/)
- [Amazon VPC Pricing](https://aws.amazon.com/vpc/pricing/)
- [EC2 metrics in CloudWatch](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/viewing_metrics_with_cloudwatch.html)
- [Amazon ECS Service Auto Scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html)
