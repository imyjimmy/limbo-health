# Limbo Health Monorepo

## Architecture Overview

Limbo Health is a comprehensive telehealth platform built as a monorepo, consolidating multiple services under a unified development and deployment workflow. The platform enables self-custodial medical records with Git-based version control, Bitcoin/Lightning payments, and WebRTC video consultations.

The monorepo architecture provides several key benefits: shared tooling and configuration, atomic commits across services, simplified dependency management, and consistent development workflows. Each service maintains its own Dockerfile and can be developed, tested, and deployed independently while sharing common infrastructure.

## Repository Structure

```
limbo-health/
├── apps/                              # Application services
│   ├── frontend/                      # React admin/provider dashboard
│   │   ├── Dockerfile                 # Production build (nginx)
│   │   ├── Dockerfile.dev             # Development (Vite hot reload)
│   │   ├── package.json
│   │   └── src/
│   ├── scheduler-api/                 # Appointment & billing service (Bun)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── server.js
│   │   ├── routes/
│   │   └── services/
│   ├── mgit-api/                      # Medical records Git server (Node)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── server.js
│   │   └── auth-persistence.js
│   └── gateway/                       # Nginx reverse proxy
│       ├── Dockerfile
│       ├── nginx.conf.template
│       └── entrypoint.sh
├── private_repos/                     # Medical record repositories (volume mount)
├── mysql-backups/                     # Database backup storage
├── docker-compose.yml                 # Base service definitions
├── docker-compose.development.yml     # Development overrides
├── docker-compose.production.yml      # Production overrides
├── .env.development                   # Development environment variables
├── package.json                       # Workspace manager
└── README.md
```

## Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Gateway (nginx)                      │
│                         Port 3003                           │
└─────────────┬──────────────────┬───────────────┬────────────┘
              │                  │               │
              ▼                  ▼               ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐
│    Frontend     │  │  Scheduler API   │  │   MGit API   │
│   (React/Vite)  │  │     (Bun)        │  │    (Node)    │
│    Port 5173    │  │    Port 3005     │  │   Port 3003  │
└─────────────────┘  └────────┬─────────┘  └──────┬───────┘
                              │                    │
                              ▼                    ▼
                     ┌────────────────┐   ┌───────────────┐
                     │     MySQL      │   │ Private Repos │
                     │   Port 3306    │   │   (Git/SQLite)│
                     └────────────────┘   └───────────────┘
```

## API Routing

The gateway routes requests based on path:

- `/*` → Frontend (provider dashboard)
- `/api/admin/*` → Scheduler API (provider management)
- `/api/appointments/*` → Scheduler API (booking system)
- `/api/providers/*` → Scheduler API (provider data)
- `/api/patients/*` → Scheduler API (patient data)
- `/api/webrtc/*` → Scheduler API (video signaling)
- `/api/billing/*` → Scheduler API (Lightning invoices)
- `/api/mgit/*` → MGit API (medical records)
- `/api/auth/*` → MGit API (Nostr authentication)

## Quick Start

```bash
# Development
docker-compose --env-file .env.development \
  -f docker-compose.yml \
  -f docker-compose.development.yml \
  up mysql scheduler-api mgit-api frontend gateway

# Access
# Frontend: http://localhost:3003
# phpMyAdmin: http://localhost:8089
```

## Technology Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Scheduler API**: Bun runtime, MySQL, nostr-tools
- **MGit API**: Node.js, Express, isomorphic-git, SQLite
- **Gateway**: Nginx with dynamic configuration
- **Database**: MySQL 8.0
- **Authentication**: Nostr, Google OAuth, JWT
- **Payments**: Lightning Network (NWC)

## Networking

**Inside Docker Network:**
- `admin-frontend` container: Vite dev server on port **5173** (internal only)
- `mgit-api` container: Server on port **3003** (internal only)
- `scheduler-api` container: Server on port **3005** (internal only)
- `gateway` container: nginx on port **80** (internal), exposed to host as **3003**

**Gateway Routing (nginx):**
```
localhost:3003/          → admin_frontend:5173 (Vite)
localhost:3003/api/*     → scheduler_api:3005
localhost:3003/api/mgit/* → mgit_api:3003
```

## Why localhost:5173 Shows Nothing

Port 5173 is **NOT exposed** to your host machine. It's only accessible inside the Docker network. The gateway container proxies requests to `admin_frontend:5173` internally.

**Check your docker-compose.development.yml:**
```yaml
admin-frontend:
  # NO ports section = not exposed to host
  # Only gateway can reach it on internal port 5173
```

## This is Correct! ✅

- ✅ `localhost:3003` → admin-frontend (through gateway)
- ✅ Hot reload works (Vite watches files via volume mount)
- ✅ API calls work (gateway proxies to backend services)

**The architecture is working as designed!** All traffic goes through the gateway, just like production.

Want to test that everything is connected? Try accessing an API endpoint through the gateway.