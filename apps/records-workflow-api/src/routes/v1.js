import { Router } from 'express';
import {
  getEffectiveWorkflowForFacility,
  getSystemWorkflows,
  searchFacilities
} from '../repositories/workflowRepository.js';

export const v1Router = Router();

v1Router.get('/facilities/search', async (req, res) => {
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

v1Router.get('/facilities/:facilityId/records-workflow', async (req, res) => {
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

v1Router.get('/hospital-systems/:id/records-workflows', async (req, res) => {
  try {
    const workflows = await getSystemWorkflows(req.params.id);
    return res.json({ workflows });
  } catch (error) {
    console.error('Failed to fetch system workflows:', error);
    return res.status(500).json({ error: 'Failed to fetch system workflows.' });
  }
});
