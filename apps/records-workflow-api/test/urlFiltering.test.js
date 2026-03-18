import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMedicalRecordsPdfFilenameStems,
  detectDocumentLanguageCode,
  extractDescriptivePdfPhrase
} from '../src/utils/pdfNaming.js';
import { collapseWhitespace } from '../src/utils/text.js';
import {
  isLikelyMedicalRecordsPdfLink,
  isLikelyWorkflowLink,
  isMedicalRecordsRequestDocument
} from '../src/utils/urls.js';

const methodistMedicalRecordsContext = {
  sourceTitle: 'How To Access Your Medical Records | Methodist Health System',
  sourceText:
    'Accessing Your Medical Records. Download and submit authorization forms to request copies of your medical records.'
};

test('does not treat quality performance pages as workflow links', () => {
  const accepted = isLikelyWorkflowLink({
    href: 'https://www.methodisthealthsystem.org/patients-visitors/patient-tools-support/map2-aco/quality-performance-results',
    text: 'Quality Performance Results',
    allowedDomain: 'methodisthealthsystem.org'
  });

  assert.equal(accepted, false);
});

test('does not accept public reporting PDFs from unrelated Methodist navigation', () => {
  const accepted = isLikelyWorkflowLink({
    href: 'https://www.methodisthealthsystem.org/sites/default/files/MAP2_ACO/Public_Reporting_Template-2025.pdf',
    text: 'Public Reporting',
    allowedDomain: 'methodisthealthsystem.org',
    ...methodistMedicalRecordsContext
  });

  assert.equal(accepted, false);
});

test('accepts medical records authorization PDFs', () => {
  const accepted = isLikelyMedicalRecordsPdfLink({
    href: 'https://www.bswhealth.com/forms/authorization-for-release-of-medical-information.pdf',
    text: 'Authorization for Release of Medical Information',
    sourceTitle: 'Request Copies of Your Medical Records',
    sourceText: 'Patients can request copies of medical records by form or online.'
  });

  assert.equal(accepted, true);
});

test('accepts Spanish medical records authorization PDFs', () => {
  const accepted = isLikelyWorkflowLink({
    href: 'https://www.hcadam.com/api/public/content/e109b112b80f42fc8291acbe0b1435fa?v=829b113e',
    text: 'Autorización para la divulgación de información médica',
    allowedDomain: 'stdavids.com',
    approvedExternal: ['hcadam.com'],
    sourceTitle: 'Medical Records | St. David\'s Medical Center',
    sourceText:
      'Download, print and complete the authorization form. Autorización para la divulgación de información médica.'
  });

  assert.equal(accepted, true);
});

test('rejects no surprises act PDFs', () => {
  const accepted = isLikelyMedicalRecordsPdfLink({
    href: 'https://www.bswhealth.com/-/media/project/bsw/sites/bswhealth/documents/privacy-and-patient-rights/no-surprises-act.pdf',
    text: 'No Surprises Act',
    sourceTitle: 'Request Copies of Your Medical Records',
    sourceText: 'Patients can request copies of medical records by form or online.'
  });

  assert.equal(accepted, false);
});

test('rejects amendment PDFs even when they mention medical records', () => {
  const accepted = isMedicalRecordsRequestDocument({
    url: 'https://www.houstonmethodist.org/-/media/pdf/for-patients/patient-resources/request-for-amendment-of-medical-records.ashx',
    title: 'Request for Amendment of Medical Records',
    text: 'Request for amendment of medical records.',
    links: []
  });

  assert.equal(accepted, false);
});

test('accepts release authorization PDFs based on parsed document text', () => {
  const accepted = isMedicalRecordsRequestDocument({
    url: 'https://www.houstonmethodist.org/-/media/pdf/for-patients/patient-resources/hm2351pdf---use-and-disclosure-of-health-info.ashx',
    title: 'Authorization for Use and Disclosure of Health Information',
    text:
      'AUTHORIZATION FOR USE AND DISCLOSURE OF HEALTH INFORMATION. Complete Medical Record. I hereby authorize Houston Methodist to disclose/release the specified information below.',
    links: []
  });

  assert.equal(accepted, true);
});

test('rejects accounting-of-disclosure PDFs', () => {
  const accepted = isMedicalRecordsRequestDocument({
    url: 'https://memorialhermann.org/-/media/memorial-hermann/org/files/patients-and-visitors/patient-services/request-for-accounting-of-disclosure-of-protected-health-information.pdf',
    title: 'Request for Accounting of Disclosure of Protected Health Information',
    text: 'Request for Accounting of Disclosure of Protected Health Information',
    links: []
  });

  assert.equal(accepted, false);
});

test('extracts a meaningful phrase from early pdf text', () => {
  const phrase = extractDescriptivePdfPhrase({
    title: '',
    text:
      'HIM.0009_v3_04.2019 Patient Request for Health Information The undersigned patient or personal representative hereby requests a copy of the medical record.'
  });

  assert.equal(phrase, 'Patient Request for Health Information');
});

test('falls back from generic titles to descriptive text phrases', () => {
  const phrase = extractDescriptivePdfPhrase({
    title: 'Patient Identification',
    text:
      'Authorization for Use and Disclosure of Protected Health Information Attachment to Privacy Policy 40.0 Effective Date: 5/11/2023 Patient Identification'
  });

  assert.equal(phrase, 'Authorization for Use and Disclosure of Protected Health Information');
});

test('builds base filename stems with descriptive phrase and language code', () => {
  const stems = buildMedicalRecordsPdfFilenameStems({
    facilityName: "St. David's Medical Center",
    systemName: "St. David's HealthCare",
    url: 'https://www.hcadam.com/api/public/content/e109b112b80f42fc8291acbe0b1435fa?v=829b113e',
    title: 'Autorización para la divulgación de información médica',
    text: 'Autorización para la divulgación de información médica'
  });

  assert.equal(
    stems[0],
    'st-david-s-medical-center-autorizacion-para-la-divulgacion-de-informacion-medica-ES'
  );
});

test('uses the first phrase to disambiguate forms before numeric suffixes', () => {
  const stems = buildMedicalRecordsPdfFilenameStems(
    {
      systemName: 'CHRISTUS Health',
      url: 'https://www.christushealth.org/-/media/christus-health/plan-care/files/mychristus/snm/patientrequestforhealthinformation.ashx',
      title: '',
      text:
        'HIM.0009_v3_04.2019 Patient Request for Health Information The undersigned patient or personal representative hereby requests:'
    },
    { limit: 8 }
  );

  assert.equal(stems[0], 'christus-health-patient-request-for-health-information-EN');
  assert.equal(stems[1], 'christus-health-patient-request-for-health-information-EN-2');
  assert.equal(stems[6], 'christus-health-patient-request-for-health-information-EN-7');
});

test('keeps parenthetical qualifiers when they are part of the form name', () => {
  const stems = buildMedicalRecordsPdfFilenameStems({
    systemName: 'Baylor Scott & White Health',
    url: 'https://www.bswhealth.com/-/media/project/bsw/sites/bswhealth/documents/patient-tools/authorization-for-release-of-medical-information-to-bswh.pdf',
    title: '',
    text:
      'Scan doc type: Authorization to Release Protected Health Information AUTHORIZATION FOR RELEASE OF MEDICAL INFORMATION (TO BSWH) BSWH-59809'
  });

  assert.equal(
    stems[0],
    'baylor-scott-and-white-health-authorization-for-release-of-medical-information-to-bswh-EN'
  );
});

test('falls back to medical-records-request when no sensible phrase exists', () => {
  const stems = buildMedicalRecordsPdfFilenameStems({
    systemName: 'Unknown Health',
    url: 'https://example.org/form.pdf',
    title: '11644',
    text: '11644'
  });

  assert.equal(stems[0], 'unknown-health-medical-records-request-EN');
});

test('detects Portuguese documents as PT', () => {
  const language = detectDocumentLanguageCode({
    url: 'https://www.massgeneralbrigham.org/content/dam/mgb-global/en/patient-care/patient-and-visitor-information/medical-records/documents/mcl/medical-records-release-mcl-portuguese.pdf',
    title: 'Partners Medical Records Release Form',
    text:
      'AUTORIZAÇÃO PARA DIVULGAÇÃO DE INFORMAÇÕES DE SAÚDE PROTEGIDAS OU PRIVILEGIADAS.'
  });

  assert.equal(language, 'PT');
});

test('infers a Mass General facility from the source URL when facilityName is missing', () => {
  const stems = buildMedicalRecordsPdfFilenameStems({
    systemName: 'Mass General Brigham',
    url: 'https://www.massgeneralbrigham.org/content/dam/mgb-global/en/patient-care/patient-and-visitor-information/medical-records/documents/sh/medical-records-release-slm-spanish.pdf',
    title: "Brigham and Women's Faulkner Hospital Medical Records Release Form - Spanish",
    text:
      'AUTORIZACIÓN PARA EXPEDIR INFORMACIÓN MÉDICA PROTEGIDA (AMPARADA POR LEY) AUTHORIZATION FOR RELEASE OF PROTECTED OR PRIVILEGED HEALTH INFORMATION'
  });

  assert.equal(
    stems[0],
    'salem-hospital-authorization-for-release-of-protected-or-privileged-health-information-ES'
  );
});

test('builds readable Portuguese stems for Mass General documents with inferred facilities', () => {
  const stems = buildMedicalRecordsPdfFilenameStems({
    systemName: 'Mass General Brigham',
    url: 'https://www.massgeneralbrigham.org/content/dam/mgb-global/en/patient-care/patient-and-visitor-information/medical-records/documents/sh/medical-records-release-slm-portuguese.pdf',
    title: 'Partners Medical Records Release Form',
    text:
      'AUTORIZAÇÃO PARA DIVULGAÇÃO DE INFORMAÇÕES DE SAÚDE PROTEGIDAS OU PRIVILEGIADAS.'
  });

  assert.equal(
    stems[0],
    'salem-hospital-autorizacao-para-divulgacao-de-informacoes-de-saude-protegidas-ou-privilegiadas-PT'
  );
});

test('collapseWhitespace strips embedded null bytes before normalizing spaces', () => {
  assert.equal(collapseWhitespace('Medical\u0000   records\u0000 request'), 'Medical records request');
});
