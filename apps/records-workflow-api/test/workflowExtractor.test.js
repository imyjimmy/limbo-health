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

test('Baylor submission instructions capture clean email, fax, and mail channels', () => {
  const bundle = extractWorkflowBundle(fixture('baylor-submission-instructions.json'), {
    isOfficialDomain: true,
  });
  const workflow = medicalWorkflow(bundle);

  assert.ok(workflow);
  assert.deepEqual(
    workflow.instructions
      .filter((item) => item.instructionKind === 'submission_channel')
      .map((item) => ({
        instructionKind: item.instructionKind,
        channel: item.channel,
        value: item.value,
      })),
    [
      {
        instructionKind: 'submission_channel',
        channel: 'fax',
        value: '855.563.BSWH (2794)',
      },
      {
        instructionKind: 'submission_channel',
        channel: 'email',
        value: 'BSWH@Healthmark-Group.com',
      },
      {
        instructionKind: 'submission_channel',
        channel: 'mail',
        value: 'Baylor Scott & White Health c/o HealthMark Group 16750 Westgrove Dr #600 Addison, TX 75001',
      },
    ],
  );
});

test('Baylor submission instructions capture generic support contact from the page paragraph', () => {
  const source = fixture('baylor-submission-instructions.json');
  const bundle = extractWorkflowBundle(
    {
      ...source,
      paragraphs: [
        'Completed request forms may be submitted in the following ways: Email: BSWH@Healthmark-Group.com Fax: 855.563.BSWH (2794) Mail: Baylor Scott & White Health c/o HealthMark Group 16750 Westgrove Dr #600 Addison, TX 75001',
        'For questions regarding medical records or to obtain the status of your request call us at 844.848.BSWH (2794)',
      ],
      contacts: [
        {
          type: 'phone',
          value: '+18448482794',
        },
      ],
    },
    { isOfficialDomain: true },
  );
  const workflow = medicalWorkflow(bundle);

  assert.ok(workflow);
  assert.deepEqual(
    workflow.instructions.find((item) => item.instructionKind === 'support_contact'),
    {
      instructionKind: 'support_contact',
      sequenceNo: 4,
      label: 'Questions Or Status',
      channel: 'phone',
      value: '+18448482794',
      details:
        'For questions regarding medical records or to obtain the status of your request call us at 844.848.BSWH (2794)',
    },
  );
});

test("St. David's fixture resolves MyHealthONE plus multi-channel requests", () => {
  const bundle = extractWorkflowBundle(fixture('stdavids.json'), { isOfficialDomain: true });
  const workflow = medicalWorkflow(bundle);
  const instructionDetails = workflow.instructions.map((item) => item.details).join(' | ');

  assert.equal(bundle.portal.portalName, 'MyHealthONE');
  assert.equal(bundle.portal.portalScope, 'most_records');
  assert.equal(workflow.formalRequestRequired, true);
  assert.equal(workflow.mailAvailable, true);
  assert.equal(workflow.emailAvailable, true);
  assert.equal(workflow.faxAvailable, true);
  assert.equal(workflow.onlineRequestAvailable, true);
  assert.ok(
    workflow.instructions.some(
      (item) => item.instructionKind === 'requirement' && /signed and dated/i.test(item.details)
    )
  );
  assert.ok(
    workflow.instructions.some(
      (item) => item.instructionKind === 'requirement' && /photo id/i.test(item.details)
    )
  );
  assert.ok(
    workflow.instructions.some(
      (item) =>
        item.instructionKind === 'submission_channel' &&
        item.channel === 'mail' &&
        /Nashville, TN 37229-0789/i.test(item.value || '')
    )
  );
  assert.match(instructionDetails, /radiology images require direct contact/i);
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

test('Cambridge Health Alliance fixture resolves MyChart plus fax, mail, and email options', () => {
  const bundle = extractWorkflowBundle(fixture('cambridge-health-alliance.json'), {
    isOfficialDomain: true
  });
  const workflow = medicalWorkflow(bundle);

  assert.equal(bundle.portal.portalName, 'MyChart');
  assert.equal(workflow.formalRequestRequired, true);
  assert.equal(workflow.faxAvailable, true);
  assert.equal(workflow.mailAvailable, true);
  assert.equal(workflow.emailAvailable, true);
  assert.ok(workflow.forms.some((form) => /authorization/i.test(form.name)));
});

test('Southcoast Health fixture resolves MyChart, online request, and authorization form workflow', () => {
  const bundle = extractWorkflowBundle(fixture('southcoast-health-ma.json'), {
    isOfficialDomain: true
  });
  const workflow = medicalWorkflow(bundle);

  assert.equal(bundle.portal.portalName, 'MyChart');
  assert.equal(workflow.onlineRequestAvailable, true);
  assert.equal(workflow.mailAvailable, true);
  assert.ok(
    workflow.forms.some(
      (form) =>
        /authorization/i.test(form.name) && /\.pdf($|\?)/i.test(form.url)
    )
  );
});

test("Boston Children's fixture resolves branded portal, fax workflow, and imaging exclusion", () => {
  const bundle = extractWorkflowBundle(fixture('boston-childrens.json'), {
    isOfficialDomain: true
  });
  const workflow = medicalWorkflow(bundle);
  const imagingWorkflow = bundle.workflows.find((row) => row.workflowType === 'imaging');

  assert.equal(bundle.portal.portalName, "MyChildren's Patient Portal");
  assert.equal(workflow.formalRequestRequired, true);
  assert.equal(workflow.faxAvailable, true);
  assert.ok(workflow.forms.some((form) => form.format === 'pdf'));
  assert.ok(imagingWorkflow);
});
