FROM node:20-alpine

WORKDIR /app

COPY apps/auth-api/package.json apps/auth-api/package-lock.json* ./

RUN npm install

COPY apps/auth-api/ ./

EXPOSE 3010

CMD ["node", "server.js"]