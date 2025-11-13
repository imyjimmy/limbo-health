FROM oven/bun:1.1.38-alpine

WORKDIR /app

# Copy package files
COPY apps/scheduler-api/package.json apps/scheduler-api/bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy application code
COPY apps/scheduler-api/ ./

# Expose port (documentation only, actual port mapping in compose)
EXPOSE 3001

# Start server
CMD ["bun", "server.js"]