#!/bin/bash
set -euo pipefail

# Clean and reinstall all node_modules for Node v24 without regenerating lockfiles.

install_with_lock() {
  local dir="$1"
  local label="$2"

  if [ ! -f "$dir/package-lock.json" ]; then
    echo "Missing $dir/package-lock.json; refusing unpinned npm install for $label." >&2
    exit 1
  fi

  echo "Installing $label dependencies with npm ci..."
  (
    cd "$dir"
    npm ci
  )
}

echo "Cleaning all node_modules..."
find . -name "node_modules" -type d -prune -exec rm -rf '{}' +

echo "Installing dependencies for all services from committed lockfiles..."
install_with_lock "." "root"
install_with_lock "apps/auth-api" "auth-api"
install_with_lock "apps/frontend" "frontend"

if [ -f "apps/gateway/package.json" ]; then
  install_with_lock "apps/gateway" "gateway"
fi

install_with_lock "apps/mgit-api" "mgit-api"
install_with_lock "apps/scheduler-api" "scheduler-api"

echo "All dependencies installed for Node v24."
echo "Now restart your Docker containers:"
echo "  docker-compose -f docker-compose.yml -f docker-compose.development.yml restart"
