import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { extractWorkflowBundle } from '../src/extractors/workflowExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fixture(name) {
  const fixturePath = path.join(__dirname, 'fixtures', name);
  const raw = fs.readFileSync(fixturePath, 'utf8');
  return JSON.parse(raw);
}

function medicalWorkflow(bundle) {
  return bundle.workflows.find((workflow) => workflow.workflowType === 'medical_records');
}

test('Baylor fixture resolves HealthMark plus authorization forms', () => {
  const bundle = extractWorkflowBundle(fixture('baylor.json'), { isOfficialDomain: true });
  const workflow = medicalWorkflow(bundle);

  assert.equal(bundle.portal.portalName, 'HealthMark');
  assert.equal(workflow.formalRequestRequired, true);
  assert.equal(workflow.onlineRequestAvailable, true);
  assert.ok(
    workflow.forms.some(
      (form) => /authorization/i.test(form.name) && /\.pdf($|\?)/i.test(form.url)
    )
  );
});

test("St. David's fixture resolves MyHealthONE plus multi-channel requests", () => {
  const bundle = extractWorkflowBundle(fixture('stdavids.json'), { isOfficialDomain: true });
  const workflow = medicalWorkflow(bundle);

  assert.equal(bundle.portal.portalName, 'MyHealthONE');
  assert.equal(workflow.formalRequestRequired, true);
  assert.equal(workflow.mailAvailable, true);
  assert.equal(workflow.emailAvailable, true);
  assert.equal(workflow.faxAvailable, true);
  assert.equal(workflow.onlineRequestAvailable, true);
});

test('Texas Health fixture resolves workflow with Verisma evidence', () => {
  const bundle = extractWorkflowBundle(fixture('texas-health.json'), { isOfficialDomain: true });
  const workflow = medicalWorkflow(bundle);

  assert.ok(workflow);
  assert.equal(bundle.portal.portalName, 'Verisma');
  assert.equal(workflow.onlineRequestAvailable, true);
});

test('UT Southwestern fixture resolves formal-copy-in-MyChart with imaging exclusion', () => {
  const bundle = extractWorkflowBundle(fixture('utsw.json'), { isOfficialDomain: true });
  const workflow = medicalWorkflow(bundle);
  const imagingWorkflow = bundle.workflows.find((row) => row.workflowType === 'imaging');

  assert.equal(bundle.portal.portalName, 'MyChart');
  assert.equal(bundle.portal.supportsFormalCopyRequestInPortal, true);
  assert.equal(workflow.formalRequestRequired, true);
  assert.equal(workflow.phoneAvailable, true);
  assert.equal(workflow.emailAvailable, true);
  assert.equal(workflow.faxAvailable, true);
  assert.equal(workflow.mailAvailable, true);
  assert.ok(imagingWorkflow);
  assert.match(workflow.specialInstructions || '', /radiology images cannot be requested/i);
});

test('Methodist fixture resolves MyChart partial access plus authorization form', () => {
  const bundle = extractWorkflowBundle(fixture('methodist.json'), { isOfficialDomain: true });
  const workflow = medicalWorkflow(bundle);

  assert.equal(bundle.portal.portalName, 'MyChart');
  assert.equal(bundle.portal.portalScope, 'partial');
  assert.equal(workflow.formalRequestRequired, true);
  assert.ok(workflow.forms.some((form) => /authorization/i.test(form.name)));
});

test('Houston Methodist fixture resolves online, PDF, MyChart, and mail/fax/email', () => {
  const bundle = extractWorkflowBundle(fixture('houston-methodist.json'), {
    isOfficialDomain: true
  });
  const workflow = medicalWorkflow(bundle);

  assert.equal(bundle.portal.portalName, 'MyChart');
  assert.equal(workflow.onlineRequestAvailable, true);
  assert.equal(workflow.mailAvailable, true);
  assert.equal(workflow.faxAvailable, true);
  assert.equal(workflow.emailAvailable, true);
  assert.ok(workflow.forms.some((form) => form.format === 'pdf'));
});
