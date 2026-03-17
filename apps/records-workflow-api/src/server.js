import 'dotenv/config';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { publicRouter } from './routes/v1.js';
import { internalRouter } from './routes/internal.js';

export const RECORDS_WORKFLOW_PUBLIC_API_PREFIX = '/api/records-workflow';
const LEGACY_V1_ERROR = {
  error: `Records workflow routes moved to ${RECORDS_WORKFLOW_PUBLIC_API_PREFIX}/*.`,
};

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'records-workflow-api' });
  });

  app.use(RECORDS_WORKFLOW_PUBLIC_API_PREFIX, publicRouter);
  app.use('/internal', internalRouter);
  app.use('/v1', (_req, res) => {
    res.status(410).json(LEGACY_V1_ERROR);
  });

  app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
  });

  app.use((error, _req, res, _next) => {
    console.error('Unhandled server error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

export function startServer(port = config.port) {
  const app = createApp();
  return app.listen(port, () => {
    console.log(`records-workflow-api listening on ${port}`);
  });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  startServer();
}
