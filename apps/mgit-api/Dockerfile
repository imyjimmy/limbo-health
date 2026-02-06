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

# Copy mgit-api package files directly
COPY --chown=node:node apps/mgit-api/package*.json ./

# Install dependencies (no workspace)
RUN npm ci --omit=dev

# Copy application files
COPY --chown=node:node apps/mgit-api/*.js ./

WORKDIR /app
EXPOSE 3003
ENV REPOS_PATH=/repos
CMD ["node", "server.js"]