#!/bin/bash

# Railway Configuration Exporter
# Exports all service configurations to YAML files

set -e

OUTPUT_DIR="railway-export"
SERVICES=("auth-api" "mgit-api" "scheduler-api" "MySQL" "gateway" "frontend")

echo "🚀 Exporting Railway configuration..."
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Install with: npm i -g @railway/cli"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged into Railway. Run: railway login"
    exit 1
fi

# Create output directory
mkdir -p $OUTPUT_DIR

# Export each service to individual JSON files
for service in "${SERVICES[@]}"; do
    echo "📦 Exporting $service..."
    railway variables --service $service --json > "$OUTPUT_DIR/railway-$service-vars.json" 2>/dev/null || echo "{}" > "$OUTPUT_DIR/railway-$service-vars.json"
done

# Create sanitized template (no secrets)
echo "🔒 Creating sanitized template..."

cat > "$OUTPUT_DIR/railway-config.template.yml" << 'EOF'
# Railway Configuration Template
# Generated from actual Railway deployment
# Fill in <SECRET> placeholders with actual values

services:
  auth-api:
    dockerfile: apps/auth-api/Dockerfile
    port: 3010
    variables:
      PORT: "3010"
      DB_HOST: "${{MySQL.RAILWAY_PRIVATE_DOMAIN}}"
      DB_USER: "${{MySQL.MYSQLUSER}}"
      DB_PASSWORD: "${{MySQL.MYSQLPASSWORD}}"
      DB_NAME: "${{MySQL.MYSQLDATABASE}}"
      JWT_SECRET: "<SECRET>"
      NOSTR_RELAYS: "wss://relay.damus.io,wss://relay.primal.net"
      GOOGLE_CLIENT_ID: "<SECRET>"
      GOOGLE_CLIENT_SECRET: "<SECRET>"

  mgit-api:
    dockerfile: apps/mgit-api/Dockerfile
    port: 3003
    variables:
      PORT: "3003"
      REPOS_PATH: "/repos"
      JWT_SECRET: "${{auth-api.JWT_SECRET}}"
    volumes:
      - mount: "/repos"
        name: "mgit-repos"

  scheduler-api:
    dockerfile: apps/scheduler-api/Dockerfile
    port: 3005
    variables:
      PORT: "3005"
      DB_HOST: "${{MySQL.RAILWAY_PRIVATE_DOMAIN}}"
      DB_USER: "${{MySQL.MYSQLUSER}}"
      DB_PASSWORD: "${{MySQL.MYSQLPASSWORD}}"
      DB_NAME: "${{MySQL.MYSQLDATABASE}}"
      DB_PORT: "3306"
      JWT_SECRET: "${{auth-api.JWT_SECRET}}"
      ALBY_CLIENT_ID: "<SECRET>"
      ALBY_CLIENT_SECRET: "<SECRET>"
      GOOGLE_CLIENT_ID: "${{auth-api.GOOGLE_CLIENT_ID}}"
      GOOGLE_CLIENT_SECRET: "${{auth-api.GOOGLE_CLIENT_SECRET}}"

  MySQL:
    image: mysql:9.4
    port: 3306
    variables:
      MYSQL_ROOT_PASSWORD: "<SECRET>"
      MYSQL_DATABASE: "railway"
      MYSQLUSER: "root"
    volume:
      mount: "/var/lib/mysql"

  gateway:
    dockerfile: apps/gateway/Dockerfile.railway
    port: 80
    variables: {}
    public_domain: "limbo.health"

  frontend:
    dockerfile: apps/frontend/Dockerfile
    port: 80
    variables: {}

networking:
  internal_dns: "*.railway.internal"
  routes:
    - path: "/api/auth"
      upstream: "auth-api:3010"
    - path: "/api/mgit"
      upstream: "mgit-api:3003"
    - path: "/api"
      upstream: "scheduler-api:3005"
    - path: "/"
      upstream: "frontend:80"
EOF

# Create README
cat > "$OUTPUT_DIR/README.md" << 'EOF'
# Railway Configuration Export

## Files

- `railway-*-vars.json` - **SECRETS** - Full variable exports (gitignored)
- `railway-config.template.yml` - Safe template for git (no secrets)

## Usage

### To recreate Railway deployment:

1. Copy the template:
```bash
   cp railway-config.template.yml railway-config.yml
```

2. Fill in `<SECRET>` placeholders with actual values

3. Use Railway CLI to set variables:
```bash
   railway service -s auth-api variable set JWT_SECRET="your_secret"
   railway service -s auth-api variable set GOOGLE_CLIENT_ID="your_id"
   # etc...
```

### To export fresh config:
```bash
../scripts/export-railway-config.sh
```

## Security

- `railway-*-vars.json` files contain secrets and are gitignored
- Only commit the sanitized template to git
EOF

echo ""
echo "✅ Export complete!"
echo ""
echo "📁 Files created in $OUTPUT_DIR/:"
echo "   - railway-*-vars.json (SECRETS - gitignored)"
echo "   - railway-config.template.yml (safe for git)"
echo "   - README.md"
echo ""
echo "⚠️  The JSON files contain secrets. Do NOT commit them."
```

## Update .gitignore

Add to **.gitignore:**
```
# Railway exports (contain secrets)
railway-export/railway-*-vars.json
railway-export/railway-config.yml

# Keep template
!railway-export/railway-config.template.yml
!railway-export/README.md