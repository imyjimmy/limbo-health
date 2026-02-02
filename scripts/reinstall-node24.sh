#!/bin/bash
# Clean and reinstall all node_modules for Node v24

echo "🧹 Cleaning all node_modules and package-lock.json files..."

# From monorepo root
find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
find . -name "package-lock.json" -type f -delete

echo "📦 Installing dependencies for all services..."

# Root monorepo
echo "Installing root dependencies..."
npm install

# Auth API
echo "Installing auth-api dependencies..."
cd apps/auth-api && npm install && cd ../..

# Frontend
echo "Installing frontend dependencies..."
cd apps/frontend && npm install && cd ../..

# Gateway (if it has package.json)
if [ -f "apps/gateway/package.json" ]; then
    echo "Installing gateway dependencies..."
    cd apps/gateway && npm install && cd ../..
fi

# MGit API
echo "Installing mgit-api dependencies..."
cd apps/mgit-api && npm install && cd ../..

# Scheduler API
echo "Installing scheduler-api dependencies..."
cd apps/scheduler-api && npm install && cd ../..

echo "✅ All dependencies installed for Node v24!"
echo "🔄 Now restart your Docker containers:"
echo "   docker-compose -f docker-compose.yml -f docker-compose.development.yml restart"