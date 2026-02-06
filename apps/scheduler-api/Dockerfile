# FROM oven/bun:latest

# WORKDIR /app

# # Copy package files
# COPY apps/scheduler-api/package.json apps/scheduler-api/package-lock.json* ./

# # Install with npm (fast), cache the npm cache
# RUN --mount=type=cache,target=/root/.npm \
#     npm ci --prefer-offline

# # Copy source code
# COPY apps/scheduler-api/ .

# EXPOSE 3005

# # Run with Bun (keeps your Bun HTTP server benefits)
# CMD ["bun", "run", "server.js"]

# Stage 1: Install dependencies with Node/npm (fast!)
# Stage 1: Install dependencies with Node/npm (fast!)
FROM node:20-alpine AS deps

WORKDIR /app

# Copy ONLY scheduler-api package.json
COPY apps/scheduler-api/package.json ./

# Install as standalone (no workspace complexity)
RUN npm install

# Stage 2: Runtime with Bun
FROM oven/bun:latest

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy package.json
COPY apps/scheduler-api/package.json ./

# Copy source code
COPY apps/scheduler-api/ ./

EXPOSE 3005

# Run with Bun
CMD ["bun", "run", "server.js"]