import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { v1Router } from './routes/v1.js';
import { internalRouter } from './routes/internal.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'records-workflow-api' });
});

app.use('/v1', v1Router);
app.use('/internal', internalRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled server error:', error);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(config.port, () => {
  console.log(`records-workflow-api listening on ${config.port}`);
});
