FROM node:20-alpine

WORKDIR /app

COPY packages/core-db/package.json packages/core-db/package-lock.json* ./packages/core-db/
COPY apps/auth-api/package.json apps/auth-api/package-lock.json* ./apps/auth-api/

WORKDIR /app/packages/core-db
RUN npm install

WORKDIR /app/apps/auth-api
RUN npm install

WORKDIR /app
COPY apps/auth-api/ ./apps/auth-api/
COPY packages/core-db/ ./packages/core-db/

WORKDIR /app/apps/auth-api

EXPOSE 3010

CMD ["node", "server.js"]
