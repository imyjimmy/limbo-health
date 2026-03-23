#!/bin/bash
# Deploy to production (Umbrel)
set -e
cd "$(dirname "$0")/.."

if [[ -f .env.production ]]; then
    # shellcheck disable=SC1091
    source .env.production
fi

echo "🐧 Deploying to production (Umbrel)..."

# Parse arguments
REMOVE_REPOS=${1:-Y}
SKIP_APPOINTMENTS=${2:-}
REBUILD=${3:-Y}  # Default: rebuild for production deployments
CONTAINER_PREFIX=${CONTAINER_PREFIX:-limbo}
POSTGRES_CONTAINER="${CONTAINER_PREFIX}_records_workflow_postgres_1"
POSTGRES_USER="${RECORDS_WORKFLOW_DB_USER:-postgres}"
POSTGRES_DB="${RECORDS_WORKFLOW_DB_NAME:-records_workflow}"
POSTGRES_PASSWORD="${RECORDS_WORKFLOW_DB_PASSWORD:-postgres}"

# Create required directories
sudo mkdir -p /opt/plebdoc-scheduler-service/{openldap/{certificates,slapd/{database,config}},mailpit,baikal/{config,data}}
sudo mkdir -p /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos

# Handle repository cleanup
if [[ $REMOVE_REPOS =~ ^[Nn]$ ]]; then
    echo "🗑️ Removing existing repositories..."
    sudo rm -rf /home/imyjimmy/umbrel/app-data/mgitreposerver-mgit-repo-server/repos/*
else
    echo "📁 Preserving existing repositories..."
fi

# Backup existing data before destroying containers
BACKUP_PATH="./postgres-backups"
mkdir -p "$BACKUP_PATH"

echo "💾 Backing up shared Postgres data..."
if docker ps --format "table {{.Names}}" | grep -q "^${POSTGRES_CONTAINER}$"; then
    docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "${POSTGRES_CONTAINER}" \
        pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" > "${BACKUP_PATH}/shared_latest.sql" 2>/dev/null || \
        echo "⚠️ Backup failed, continuing..."
fi

# Stop existing services
echo "🛑 Stopping existing services..."
docker-compose -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production down

# Force rebuild and pull fresh images for production
if [[ $REBUILD =~ ^[Yy]$ ]]; then
    echo "🔨 Rebuilding images for production..."
    
    # Remove existing images to force rebuild
    docker rmi imyjimmy/mgit-repo-server:latest 2>/dev/null || true
    docker rmi imyjimmy/mgit-gateway:latest 2>/dev/null || true
    docker rmi plebdoc-scheduler-api:latest 2>/dev/null || true
    
    # Build and push fresh images
    ./scripts/build.sh
fi

# Pull latest images
echo "📥 Pulling latest images..."
docker pull imyjimmy/mgit-repo-server:latest
docker pull imyjimmy/mgit-gateway:latest

# Conditional startup based on arguments
if [[ "$SKIP_APPOINTMENTS" == "no-appt" ]]; then
    echo "⏭️ Skipping appointments services..."
    docker-compose -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production up -d mgit-web gateway
else
    echo "🚀 Starting all production services..."
    docker-compose -f docker-compose.yml -f docker-compose.production.yml --env-file .env.production up -d
fi

echo "✅ Production deployment complete!"
echo ""
echo "🌐 Services available at:"
echo "   📝 Patient Frontend: http://$(hostname -I | awk '{print $1}'):3003"
echo "   🐘 Postgres: http://$(hostname -I | awk '{print $1}'):5433"
echo "   🔧 Scheduler API: http://$(hostname -I | awk '{print $1}'):3005"
echo "   📖 Swagger UI: http://$(hostname -I | awk '{print $1}'):8090"
