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

    await fs.access(sourceDocument.storage_path);

    if (sourceDocument.source_type === 'pdf') {
      res.type('application/pdf');
    } else {
      res.type('text/html; charset=utf-8');
    }

    return res.sendFile(sourceDocument.storage_path);
  } catch (error) {
    console.error('Failed to fetch source document content:', error);
    return res.status(500).json({ error: 'Failed to fetch source document content.' });
  }
});
