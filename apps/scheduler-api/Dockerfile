FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY apps/scheduler-api/package.json ./
COPY apps/scheduler-api/bun.lockb ./

# Install dependencies with Bun
RUN bun install --frozen-lockfile

# Copy application code
COPY apps/scheduler-api/ ./

EXPOSE 3005
CMD ["bun", "run", "server.js"]