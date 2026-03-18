import { Router } from 'express';
import { runCrawl } from '../services/crawlService.js';
import { reseedFromFile } from '../services/seedService.js';
import { getExtractionRunById } from '../repositories/workflowRepository.js';

export const internalRouter = Router();

internalRouter.post('/crawl/run', async (req, res) => {
  try {
    const summary = await runCrawl({
      state: req.body?.state || null,
      systemName: req.body?.system_name || null,
      maxDepth: Number.isInteger(req.body?.max_depth)
        ? req.body.max_depth
        : undefined
    });

    return res.json(summary);
  } catch (error) {
    console.error('Crawl run failed:', error);
    return res.status(500).json({ error: 'Crawl run failed.' });
  }
});

internalRouter.post('/crawl/reseed', async (req, res) => {
  try {
    const summary = await reseedFromFile({
      state: req.body?.state || null,
      seedFilePath: req.body?.seed_file || null
    });
    return res.json({ status: 'ok', summary });
  } catch (error) {
    console.error('Reseed failed:', error);
    return res.status(500).json({ error: 'Reseed failed.' });
  }
});

internalRouter.get('/extraction-runs/:id', async (req, res) => {
  try {
    const run = await getExtractionRunById(req.params.id);
    if (!run) {
      return res.status(404).json({ error: 'Extraction run not found.' });
    }

    return res.json({ run });
  } catch (error) {
    console.error('Failed to load extraction run:', error);
    return res.status(500).json({ error: 'Failed to load extraction run.' });
  }
});
