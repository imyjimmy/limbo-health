FROM node:20-bullseye-slim

# Install git and basic dependencies
RUN apt-get update && \
    apt-get install -y git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Verify git installation
RUN git --version

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
CMD ["node", "server.js"]