FROM node:20-bullseye-slim AS base

# Install system dependencies
RUN apt-get update && \
    apt-get install -y curl git ca-certificates wget build-essential python3 unzip && \
    rm -rf /var/lib/apt/lists/*

# Platform-specific Go installation
FROM base AS go-installer
ARG TARGETPLATFORM
RUN case "$TARGETPLATFORM" in \
    "linux/amd64") GO_ARCH="amd64" ;; \
    "linux/arm64") GO_ARCH="arm64" ;; \
    *) echo "Unsupported platform: $TARGETPLATFORM" && exit 1 ;; \
    esac && \
    wget -O go.tar.gz "https://go.dev/dl/go1.20.5.linux-${GO_ARCH}.tar.gz" && \
    tar -C /usr/local -xzf go.tar.gz && \
    rm go.tar.gz

FROM go-installer AS builder
ENV PATH="/usr/local/go/bin:${PATH}"

# Build mgit binary from submodule at root
COPY mgit/ /go/src/mgit/
ARG TARGETPLATFORM
RUN cd /go/src/mgit && \
    case "$TARGETPLATFORM" in \
    "linux/amd64") export GOARCH=amd64 ;; \
    "linux/arm64") export GOARCH=arm64 ;; \
    esac && \
    go build -buildvcs=false -o /usr/local/bin/mgit && \
    chmod +x /usr/local/bin/mgit

# Final stage
FROM base
COPY --from=builder /usr/local/bin/mgit /usr/local/bin/mgit

# Create directories
RUN mkdir -p /app /repos /app/users && \
    chown -R node:node /app /repos

USER node
WORKDIR /app

# Copy ROOT workspace files first
COPY --chown=node:node package*.json ./

# Copy mgit-api package.json
COPY --chown=node:node apps/mgit-api/package.json ./apps/mgit-api/

# Install using workspace
RUN npm ci --workspace=apps/mgit-api --omit=dev

# Copy application files
COPY --chown=node:node apps/mgit-api/*.js ./apps/mgit-api/

WORKDIR /app/apps/mgit-api
EXPOSE 3003
ENV REPOS_PATH=/repos
ENV MGITPATH=/usr/local/bin
CMD ["node", "server.js"]