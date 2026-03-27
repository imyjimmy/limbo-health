import fs from 'node:fs/promises';
import { Router } from 'express';
import {
  getEffectiveWorkflowForFacility,
  getSourceDocumentById,
  getSystemRequestPacket,
  getSystemWorkflows,
  listHospitalSystems,
  searchFacilities
} from '../repositories/workflowRepository.js';
import {
  closeWizardSession,
  createWizardSession,
  getWizardSessionState,
  respondToWizardSession,
} from '../services/wizardSessionService.js';
import { resolveSourceDocumentPath } from '../utils/sourceDocumentStorage.js';

export const publicRouter = Router();
export const v1Router = publicRouter;

publicRouter.get('/hospital-systems', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const results = await listHospitalSystems(q);
    return res.json({ results });
  } catch (error) {
    console.error('Failed to list hospital systems:', error);
    return res.status(500).json({ error: 'Failed to list hospital systems.' });
  }
});

publicRouter.get('/facilities/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required.' });
    }

    const results = await searchFacilities(q);
    return res.json({ results });
  } catch (error) {
    console.error('Failed to search facilities:', error);
    return res.status(500).json({ error: 'Failed to search facilities.' });
  }
});

publicRouter.get('/facilities/:facilityId/records-workflow', async (req, res) => {
  try {
    const payload = await getEffectiveWorkflowForFacility(req.params.facilityId);
    if (!payload) {
      return res.status(404).json({ error: 'Facility not found.' });
    }
    return res.json(payload);
  } catch (error) {
    console.error('Failed to fetch facility workflow:', error);
    return res.status(500).json({ error: 'Failed to fetch facility workflow.' });
  }
});

publicRouter.get('/hospital-systems/:id/records-workflows', async (req, res) => {
  try {
    const workflows = await getSystemWorkflows(req.params.id);
    return res.json({ workflows });
  } catch (error) {
    console.error('Failed to fetch system workflows:', error);
    return res.status(500).json({ error: 'Failed to fetch system workflows.' });
  }
});

publicRouter.get('/hospital-systems/:id/records-request-packet', async (req, res) => {
  try {
    const payload = await getSystemRequestPacket(req.params.id);
    if (!payload) {
      return res.status(404).json({ error: 'Hospital system not found.' });
    }
    return res.json(payload);
  } catch (error) {
    console.error('Failed to fetch system request packet:', error);
    return res.status(500).json({ error: 'Failed to fetch system request packet.' });
  }
});

publicRouter.get('/source-documents/:id/content', async (req, res) => {
  try {
    const sourceDocument = await getSourceDocumentById(req.params.id);
    if (!sourceDocument?.storage_path) {
      return res.status(404).json({ error: 'Source document not found.' });
    }

    const resolvedStoragePath = resolveSourceDocumentPath(sourceDocument.storage_path);
    await fs.access(resolvedStoragePath);

    if (sourceDocument.source_type === 'pdf') {
      res.type('application/pdf');
    } else {
      res.type('text/html; charset=utf-8');
    }

    return res.sendFile(resolvedStoragePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ error: 'Source document content not found on disk.' });
    }

    console.error('Failed to fetch source document content:', {
      sourceDocumentId: req.params.id,
      error,
    });
    return res.status(500).json({ error: 'Failed to fetch source document content.' });
  }
});

publicRouter.post('/wizard-sessions', async (req, res) => {
  try {
    const session = await createWizardSession({
      launchUrl: req.body?.launch_url,
    });
    return res.status(201).json({ session });
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    if (statusCode >= 500) {
      console.error('Failed to create hosted wizard session:', error);
    }

    return res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Failed to create hosted wizard session.',
    });
  }
});

publicRouter.get('/wizard-sessions/:sessionId', async (req, res) => {
  try {
    const session = await getWizardSessionState(req.params.sessionId);
    return res.json({ session });
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    if (statusCode >= 500) {
      console.error('Failed to refresh hosted wizard session:', error);
    }

    return res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Failed to refresh hosted wizard session.',
    });
  }
});

publicRouter.post('/wizard-sessions/:sessionId/respond', async (req, res) => {
  try {
    const session = await respondToWizardSession(req.params.sessionId, req.body || {});
    return res.json({ session });
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    if (statusCode >= 500) {
      console.error('Failed to respond to hosted wizard session:', error);
    }

    return res.status(statusCode).json({
      error: error instanceof Error ? error.message : 'Failed to respond to hosted wizard session.',
    });
  }
});

publicRouter.delete('/wizard-sessions/:sessionId', async (req, res) => {
  try {
    const closed = await closeWizardSession(req.params.sessionId);
    if (!closed) {
      return res.status(404).json({ error: 'Wizard session not found.' });
    }

    return res.status(204).end();
  } catch (error) {
    console.error('Failed to close hosted wizard session:', error);
    return res.status(500).json({ error: 'Failed to close hosted wizard session.' });
  }
});
