FROM oven/bun:latest

WORKDIR /app

COPY packages/core-db/package.json packages/core-db/package-lock.json* ./packages/core-db/

# Copy package files
COPY apps/scheduler-api/package.json apps/scheduler-api/package-lock.json* ./apps/scheduler-api/

WORKDIR /app/packages/core-db
RUN bun install

# Install dependencies with Bun
WORKDIR /app/apps/scheduler-api
RUN bun install --frozen-lockfile

# Copy application code
WORKDIR /app
COPY apps/scheduler-api/ ./apps/scheduler-api/
COPY packages/core-db/ ./packages/core-db/

WORKDIR /app/apps/scheduler-api

EXPOSE 3005
CMD ["bun", "run", "server.js"]
