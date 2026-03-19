import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMedicalRecordsPdfFilenameStems,
  detectDocumentLanguageCode,
  extractDescriptivePdfPhrase
} from '../src/utils/pdfNaming.js';
import {
  buildPdfHeaderLines,
  inferFacilityNameFromHeaderLines
} from '../src/utils/pdfHeader.js';
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

test('prefers english header language over multilingual footer boilerplate', () => {
  const language = detectDocumentLanguageCode({
    title: '',
    headerText: 'PATIENT REQUEST FOR ACCESS TO DESIGNATED RECORD SET',
    text:
      'PATIENT REQUEST FOR ACCESS TO DESIGNATED RECORD SET ATTENTION: If you do not speak English... ATENCIÓN: Si habla español, tiene a su disposición servicios gratuitos de asistencia lingüística.'
  });

  assert.equal(language, 'EN');
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

test('extracts Vermont facility names from page-one header lines', () => {
  const facilityName = inferFacilityNameFromHeaderLines({
    systemName: 'The University of Vermont Medical Center',
    headerLines: [
      { text: 'Porter Medical Center MRN:', y: 774.12, x: 264.12, fontSize: 9.96 },
      { text: '115 Porter Drive Name:', y: 761.88, x: 275.88, fontSize: 9.96 },
      { text: 'Middlebury, VT 05753', y: 749.64, x: 264.12, fontSize: 9.96 },
      {
        text: 'AUTHORIZATION TO RELEASE PROTECTED HEALTH INFORMATION',
        y: 724.68,
        x: 54,
        fontSize: 12.18
      },
      {
        text: 'BY SIGNING THIS FORM, YOU AUTHORIZE THE SPECIFIED UNIVERSITY OF VERMONT HEALTH NETWORK ENTITY, OR ITS AGENTS TO RELEASE INFORMATION.',
        y: 708,
        x: 52.2,
        fontSize: 9.96
      }
    ]
  });

  assert.equal(facilityName, 'Porter Medical Center');
});

test('builds Vermont stems from page-one header context instead of system fallback', () => {
  const stems = buildMedicalRecordsPdfFilenameStems({
    systemName: 'The University of Vermont Medical Center',
    url: 'https://www.uvmhealth.org/sites/default/files/2024-04/pmc-authorization-to-release-protected-health-information-form-037347.pdf',
    title: '',
    text:
      'AUTHORIZATION TO RELEASE PROTECTED HEALTH INFORMATION BY SIGNING THIS FORM, YOU AUTHORIZE THE SPECIFIED UNIVERSITY OF VERMONT HEALTH NETWORK ENTITY, OR ITS AGENTS TO RELEASE INFORMATION.',
    headerLines: [
      { text: 'Porter Medical Center MRN:', y: 774.12, x: 264.12, fontSize: 9.96 },
      { text: '115 Porter Drive Name:', y: 761.88, x: 275.88, fontSize: 9.96 },
      { text: 'Middlebury, VT 05753', y: 749.64, x: 264.12, fontSize: 9.96 },
      {
        text: 'AUTHORIZATION TO RELEASE PROTECTED HEALTH INFORMATION',
        y: 724.68,
        x: 54,
        fontSize: 12.18
      }
    ]
  });

  assert.equal(stems[0], 'porter-medical-center-authorization-to-release-protected-health-information-EN');
});

test('builds mychart proxy stems from header title lines', () => {
  const stems = buildMedicalRecordsPdfFilenameStems({
    systemName: 'The University of Vermont Medical Center',
    url: 'https://www.uvmhealth.org/sites/default/files/2024-04/uvmhn-mychart-proxy-access-request-over-18-form-037035.pdf',
    title: '',
    text: 'Proxy access request.',
    headerLines: [
      { text: 'FOR PATIENTS 18 AND OLDER', y: 753, x: 403.8, fontSize: 12.18 },
      { text: 'MyChart Proxy Access', y: 702, x: 156.96, fontSize: 26 },
      { text: 'Request & Authorization Form', y: 664.19, x: 106.66, fontSize: 26 }
    ]
  });

  assert.equal(
    stems[0],
    'the-university-of-vermont-medical-center-for-patients-18-and-older-mychart-proxy-access-request-and-authorization-form-EN'
  );
});

test('normalizes collapsed all-caps providence header titles before phrase matching', () => {
  const stems = buildMedicalRecordsPdfFilenameStems({
    systemName: 'Providence Washington',
    url: '',
    title: '01-243978 Providence 970392 Print',
    text:
      'PATIENT REQUEST TO AMEND A DESIGNATED RECORD SET This form must be complete and legible in order to be processed.',
    headerLines: [
      { text: 'PATIENTREQUESTTOAMENDADESIGNATEDRECORDSET', y: 724.84, x: 58.08, fontSize: 20.96 },
      {
        text: 'This form must be complete and legible in order to be processed.',
        y: 686.68,
        x: 100.44,
        fontSize: 15.37
      }
    ]
  });

  assert.equal(
    stems[0],
    'providence-washington-patient-request-to-amend-a-designated-record-set-EN'
  );
});

test('keeps age qualifiers in mychart proxy stems when the header uses My Chart spacing', () => {
  const stems = buildMedicalRecordsPdfFilenameStems({
    systemName: 'The University of Vermont Medical Center',
    url: 'https://www.uvmhealth.org/sites/default/files/2024-04/uvmhn-mychart-proxy-access-request-patients-12-17-form-037038.pdf',
    title: '',
    text: 'Proxy access request.',
    headerLines: [
      { text: 'FOR PATIENTS 12-17 YEARS OLD', y: 747.48, x: 394.56, fontSize: 12.18 },
      { text: 'My Chart Proxy Access', y: 690, x: 165.24, fontSize: 26 },
      { text: 'Request & Authorization Form', y: 652.19, x: 114.82, fontSize: 26 }
    ]
  });

  assert.equal(
    stems[0],
    'the-university-of-vermont-medical-center-for-patients-12-17-years-old-mychart-proxy-access-request-and-authorization-form-EN'
  );
});

test('falls back to the pdf url slug when header lines do not expose a title', () => {
  const phrase = extractDescriptivePdfPhrase({
    url: 'https://www.northwesternmedicalcenter.org/pdf/patient-portal-terms-and-conditions/',
    headerLines: [{ text: 'Northwestern Medical Center', fontSize: 11.66 }],
    text: ''
  });

  assert.equal(phrase, 'Patient Portal Terms and Conditions');
});

test('groups top-of-page pdf text items into clean header lines', () => {
  const lines = buildPdfHeaderLines({
    pageHeight: 792,
    items: [
      { str: 'Porter Medical Center', transform: [9.96, 0, 0, 9.96, 264.12, 774.12] },
      { str: 'MRN:', transform: [9.96, 0, 0, 9.96, 417.96, 775.32] },
      { str: '115 ', transform: [9.96, 0, 0, 9.96, 275.88, 761.88] },
      { str: 'Porter Drive', transform: [9.96, 0, 0, 9.96, 293.28, 761.88] },
      { str: 'Name:', transform: [9.96, 0, 0, 9.96, 417.96, 760.44] },
      {
        str: 'AUTHORIZATION TO RELEASE PROTECTED HEALTH INFORMATION',
        transform: [11.04, 0, 0, 11.04, 54, 724.68]
      }
    ]
  });

  assert.equal(lines[0].text, 'Porter Medical Center');
  assert.equal(lines[1].text, '115 Porter Drive');
  assert.equal(lines[2].text, 'AUTHORIZATION TO RELEASE PROTECTED HEALTH INFORMATION');
});

test('collapseWhitespace strips embedded null bytes before normalizing spaces', () => {
  assert.equal(collapseWhitespace('Medical\u0000   records\u0000 request'), 'Medical records request');
});
