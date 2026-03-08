FROM node:20-alpine

WORKDIR /app

COPY apps/records-workflow-api/package*.json ./
RUN npm ci

COPY apps/records-workflow-api/ ./

ENV PORT=3020
EXPOSE 3020

CMD ["npm", "run", "start"]
