# Multi-stage build for React app
FROM node:20-bullseye-slim as builder

# Install system dependencies including curl
RUN apt-get update && \
    apt-get install -y curl zip unzip ca-certificates git build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun/bin/bun /usr/local/bin/

WORKDIR /app

# Copy package files from apps/frontend
COPY apps/frontend/package*.json ./
COPY apps/frontend/bun.lockb* ./

# Install dependencies
RUN bun install

# Copy source code from apps/frontend
COPY apps/frontend/ ./

# Clean esbuild/vite cache before build (THIS IS THE FIX)
RUN rm -rf node_modules/.vite && \
    rm -rf node_modules/esbuild && \
    bun install --force
    
# Build the app
RUN bun run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config for SPA routing
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]