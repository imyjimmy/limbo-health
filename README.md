# Limbo Health Monorepo

## Architecture Overview

Limbo Health is a comprehensive telehealth platform built as a monorepo, consolidating multiple services under a unified development and deployment workflow. The platform enables self-custodial medical records with Git-based version control, Bitcoin/Lightning payments, and WebRTC video consultations.

The monorepo architecture provides several key benefits: shared tooling and configuration, atomic commits across services, simplified dependency management, and consistent development workflows. Each service maintains its own Dockerfile and can be developed, tested, and deployed independently while sharing common infrastructure.

## Repository Structure
```
limbo-health/
├── apps/                              # Application services
│   ├── frontend/                      # React patient & provider dashboard
│   │   ├── Dockerfile                 # Production build (nginx)
│   │   ├── Dockerfile.dev             # Development (Vite hot reload)
│   │   ├── package.json
│   │   └── src/
│   ├── auth-api/                      # Nostr & Google OAuth authentication (Node)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── server.js
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
│       ├── Dockerfile.railway
│       ├── nginx.conf
│       ├── nginx.railway.conf
│       └── nginx.conf.template
├── private_repos/                     # Medical record repositories (volume mount)
├── mysql-backups/                     # Database backup storage
├── railway-export/                    # Railway deployment configs
│   ├── railway-config.template.yml    # Safe template (no secrets)
│   └── README.md                      # Deployment guide
├── scripts/
│   └── export-railway-config.sh       # Export Railway configuration
├── docker-compose.yml                 # Base service definitions
├── docker-compose.development.yml     # Development overrides
├── docker-compose.production.yml      # Production overrides
├── .env.development                   # Development environment variables
├── .env.production.example            # Production environment template
├── package.json                       # Workspace manager
└── README.md
```

## Service Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                      Gateway (nginx)                        │
│              Production: limbo.health                       │
│              Development: localhost:3003                    │
└─────┬──────────┬──────────┬───────────┬──────────────┬──────┘
      │          │          │           │              │
      ▼          ▼          ▼           ▼              ▼
┌──────────┐ ┌────────┐ ┌─────────┐ ┌────────┐ ┌────────────┐
│ Frontend │ │ Auth   │ │Scheduler│ │ MGit   │ │   MySQL    │
│ (React)  │ │ API    │ │  API    │ │  API   │ │            │
│ Port 80  │ │ :3010  │ │  :3005  │ │ :3003  │ │   :3306    │
└──────────┘ └────────┘ └────┬────┘ └───┬────┘ └─────┬──────┘
                             │          │            │
                             └──────────┴────────────┘
                                        │
                                   MySQL Database
```

## API Routing

The gateway routes requests based on path:

- `/*` → Frontend (patient & provider dashboard)
- `/api/auth/*` → Auth API (Nostr & Google OAuth)
- `/api/mgit/*` → MGit API (medical records repositories)
- `/api/webrtc/*` → Scheduler API (video signaling)
- `/api/*` → Scheduler API (appointments, billing, providers, patients)

## Quick Start

### Development
```bash
# Start all services
docker-compose --env-file .env.development \
  -f docker-compose.yml \
  -f docker-compose.development.yml \
  up

# Access
# Frontend: http://localhost:3003
# phpMyAdmin: http://localhost:8089
```

### Production (Local Testing)
```bash
# Setup environment
cp .env.production.example .env.production
# Edit .env.production with your values

# Start production stack
docker-compose \
  -f docker-compose.yml \
  -f docker-compose.production.yml \
  up --build
```

## Technology Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Radix UI
- **Auth API**: Node.js, Express, nostr-tools, Google OAuth
- **Scheduler API**: Bun runtime, MySQL, WebRTC, Lightning Network
- **MGit API**: Node.js, Express, isomorphic-git, NIP-44 encryption
- **Gateway**: Nginx with dynamic configuration
- **Database**: MySQL 9.4
- **Authentication**: Nostr (NIP-07), Google OAuth, JWT
- **Payments**: Lightning Network (Alby NWC)

## Deployment

### Railway (Production)

The production deployment runs on Railway with the following services:

- **Gateway**: Public-facing nginx proxy (limbo.health)
- **Frontend**: React SPA served via nginx
- **Auth API**: Authentication service
- **Scheduler API**: Appointment & billing backend
- **MGit API**: Medical records Git server (with persistent volume)
- **MySQL**: Database (with persistent volume)

#### Export Railway Configuration
```bash
# Make script executable
chmod +x scripts/export-railway-config.sh

# Export current Railway config
./scripts/export-railway-config.sh
```

This creates:
- `railway-export/railway-*-vars.json` - Full configs with secrets (gitignored)
- `railway-export/railway-config.template.yml` - Safe template for version control
- `railway-export/README.md` - Deployment instructions

#### Recreate Deployment

See `railway-export/README.md` for instructions on recreating the Railway deployment from the exported configuration.

## Networking

### Development (Docker Compose)

**Inside Docker Network:**
- `frontend` container: Vite dev server on port **5173** (internal)
- `auth-api` container: Server on port **3010** (internal)
- `mgit-api` container: Server on port **3003** (internal)
- `scheduler-api` container: Server on port **3005** (internal)
- `gateway` container: nginx on port **80** (internal), exposed as **3003**

**Gateway Routing (nginx):**
```
localhost:3003/              → frontend:5173 (Vite)
localhost:3003/api/auth/*    → auth-api:3010
localhost:3003/api/mgit/*    → mgit-api:3003
localhost:3003/api/*         → scheduler-api:3005
```

### Production (Railway)

**Internal DNS:**
- Services communicate via `*.railway.internal` addresses
- Gateway proxies to: `auth-api.railway.internal:3010`, etc.
- Frontend served on port 80 (nginx production build)

**Key Differences:**
- Frontend uses production nginx build (not Vite dev server)
- All services listen on `0.0.0.0` (required for Railway networking)
- Database credentials via environment variables
- Persistent volumes for MySQL and medical records

## Environment Variables

Required environment variables are documented in:
- `.env.development` - Development configuration
- `.env.production.example` - Production template

Critical variables:
- `JWT_SECRET` - Shared across auth-api, mgit-api, scheduler-api
- `DB_HOST`, `DB_USER`, `DB_PASSWORD` - Database connection
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - OAuth
- `ALBY_CLIENT_ID`, `ALBY_CLIENT_SECRET` - Lightning payments

## Development Workflow
```bash
# Install dependencies
npm install

# Start development environment
docker-compose -f docker-compose.yml -f docker-compose.development.yml up

# View logs
docker-compose logs -f [service-name]

# Rebuild specific service
docker-compose -f docker-compose.yml -f docker-compose.development.yml up -d --build [service-name]

# Stop all services
docker-compose down
```

## Git Hooks And Test Gates

Tiered local gates are configured:

- `pre-commit` (fast): staged whitespace/conflict checks, optional lint if a root `lint` script exists.
- `pre-push` (heavier): root integration tests + React Native Jest tests.

Install hooks once per clone:

```bash
npm run hooks:install
```

Run gates manually:

```bash
npm run hooks:precommit
npm run hooks:prepush
```

Optional pre-push skip flags:

```bash
# One push only
SKIP_PREPUSH_TESTS=1 git push

# Persistent local toggle (until unset)
git config hooks.skipPrePushTests true
git config --unset hooks.skipPrePushTests
```

## Testing

Integration tests now live under each service:
- `apps/auth-api/__tests__`
- `apps/mgit-api/__tests__`

Run from repo root:

```bash
# All integration tests
npm run test:integration

# Watch mode
npm run test:integration:watch

# All integration tests with verbose reporter
npm run test:integration:verbose

# Auth API tests only (verbose)
npm run test:auth

# MGit API tests only (verbose)
npm run test:mgit
```

## Mobile App (Expo / EAS)

The React Native app lives in `apps/react-native/` and is built and distributed via [EAS Build](https://docs.expo.dev/build/introduction/).

### Prerequisites

```bash
npm install -g eas-cli
cd apps/react-native
eas login
```

### Environment Variables

Local `.env` is gitignored. EAS cloud builds use their own env store. Before building, verify parity:

```bash
# Check that all local .env keys exist in EAS production environment
./apps/react-native/scripts/check-eas-env.sh production

# List what EAS currently has
eas env:list --environment production

# Add a missing variable
eas env:create --name EXPO_PUBLIC_EXAMPLE --value "value" --environment production --visibility plaintext
```

### Build

```bash
cd apps/react-native

# Production build (App Store / TestFlight)
# This bumps expo.version patch (x.y.z -> x.y.z+1) before running EAS build.
npm run build:ios:production

# Simulator build (for local QA on iPad/iPhone simulators)
eas build --platform ios --profile production-simulator

# Development client (for Expo Go-like dev workflow)
eas build --platform ios --profile development
```

### Submit to App Store

```bash
cd apps/react-native

# Upload the latest production build to App Store Connect
eas submit --platform ios --latest
```

This requires interactive Apple ID login. After upload, go to [App Store Connect](https://appstoreconnect.apple.com) to add the build to a submission and submit for review.

### EAS Profiles (eas.json)

| Profile | Purpose | Distribution |
|---|---|---|
| `production` | App Store / TestFlight | App Store (auto-increment iOS build number) |
| `production-simulator` | Local simulator testing of release builds | Simulator |
| `development` | Dev client with Expo DevTools | Internal |

## Troubleshooting

### Port 5173 Shows Nothing

This is correct! Port 5173 is **not exposed** to your host machine - it's only accessible inside the Docker network. Access the frontend through the gateway at `localhost:3003`.

### Database Connection Issues

Ensure services use environment variables for DB connection:
```javascript
host: process.env.DB_HOST || 'localhost',
user: process.env.DB_USER || 'root',
```

Never hardcode credentials.

### Service Can't Reach Another Service

**Local Development:** Check service names in `docker-compose.yml`
**Railway:** Ensure services listen on `0.0.0.0`, not `localhost`:
```javascript
app.listen(PORT, '0.0.0.0', () => { ... });
```
