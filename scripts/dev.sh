#!/bin/bash
cd "$(dirname "$0")/.."
source .env.development

# Start development environment
set -e

echo "🍎 Starting development environment..."

# Parse arguments
REBUILD=${1:-Y}  # Default: rebuild (development should be fresh)
RESTORE_BACKUP=${2:-Y}  # Default: restore backup if available

# Create network if it doesn't exist
docker network create $NETWORK 2>/dev/null || true

# Create required directories
# mkdir -p "$(pwd)/../private_repos"
# mkdir -p "$(pwd)/../app-data"/{mysql,openldap/{certificates,slapd/{database,config}},mailpit,baikal/{config,data}}

# Stop any running services first
echo "🛑 Stopping existing services..."
docker-compose -f docker-compose.yml -f docker-compose.development.yml --env-file .env.development down

# Rebuild images if requested
if [[ $REBUILD =~ ^[Yy]$ ]] || [[ $REBUILD == "rebuild" ]]; then
    echo "🔨 Rebuilding images..."
    
    # Remove existing images to force rebuild
    docker rmi imyjimmy/mgit-repo-server:latest 2>/dev/null || true
    docker rmi imyjimmy/mgit-gateway:latest 2>/dev/null || true
    docker rmi plebdoc-scheduler-api:latest 2>/dev/null || true
    
    # Build fresh images
    ./scripts/build.sh
fi

# Check for backup and restore if available
# limbo_shared_postgres_backup_20260322_120000.sql
BACKUP_PATH="./postgres-backups/shared_latest.sql"
POSTGRES_CONTAINER="${CONTAINER_PREFIX}_records_workflow_postgres_1"
POSTGRES_USER="${RECORDS_WORKFLOW_DB_USER:-postgres}"
POSTGRES_DB="${RECORDS_WORKFLOW_DB_NAME:-records_workflow}"
RESTORE_FLAG=""
if [[ -f "$BACKUP_PATH" && $RESTORE_BACKUP =~ ^[Yy]$ ]]; then
    echo "📋 Found backup: $BACKUP_PATH"
    echo "🔄 Will restore after Postgres starts..."
    RESTORE_FLAG="--restore"
fi

# Start services
echo "🚀 Starting development services..."
docker-compose -f docker-compose.yml -f docker-compose.development.yml --env-file .env.development up -d

# Restore backup if available
if [[ -n "$RESTORE_FLAG" && -f "$BACKUP_PATH" ]]; then
    echo "⏳ Waiting for Postgres to be ready..."
    for attempt in {1..30}; do
        if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
            break
        fi
        sleep 2
    done

    echo "📥 Restoring database from backup. CONTAINER_PREFIX: ${CONTAINER_PREFIX}"
    docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$BACKUP_PATH" || \
        echo "⚠️ Backup restore failed (this is OK if starting fresh)"
fi

echo "✅ Development environment started!"
echo ""
echo "🌐 Services available at:"
echo "   📝 Patient Frontend: http://localhost:3003"
echo "   💾 Adminer: http://localhost:8089"
echo "   🐘 Postgres: localhost:5433"
echo "   🔧 Scheduler API: http://localhost:3005"
echo "   📖 Swagger UI: http://localhost:8090"
