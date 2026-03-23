import { describe, expect, it } from 'vitest';
import { expandCandidateLinks } from '../src/crawler/linkExpander.js';

describe('expandCandidateLinks', () => {
  const document = {
    url: 'https://www.bswhealth.com/patient-tools/request-copies-of-your-medical-records',
    title: 'Request Copies of Your Medical Records | Baylor Scott & White Health',
    text: 'Request copies of your medical records and access authorization forms.',
    links: [
      {
        text: 'Authorization for release of information to BSWH',
        href: 'https://www.bswhealth.com/-/media/project/bsw/sites/bswhealth/documents/patient-tools/authorization-for-release-of-medical-information-to-bswh.pdf',
        contextText: 'Download the medical records authorization form.',
      },
      {
        text: 'Request Manager',
        href: 'https://requestmanager.healthmark-group.com/register',
        contextText: 'Use HealthMark Request Manager to request records online.',
      },
      {
        text: 'Patient Registration and Billing Center',
        href: 'https://www.bswhealth.com/patient-tools/registration-and-billing',
        contextText: 'Estimate your cost of care, billing, and payment assistance.',
      },
      {
        text: 'Imaging and Radiology',
        href: 'https://www.bswhealth.com/specialties/imaging-and-radiology',
        contextText: 'Radiology services and imaging center locations.',
      },
      {
        text: 'MyBSWHealth',
        href: 'https://my.bswhealth.com/login',
        contextText: 'Patient portal access for records requests.',
      },
    ],
  };

  it('keeps crawl expansion broad in general mode', () => {
    const expanded = expandCandidateLinks({
      document,
      allowedDomain: 'bswhealth.com',
    });

    expect(expanded.map((link) => link.url)).toEqual(
      expect.arrayContaining([
        'https://www.bswhealth.com/patient-tools/registration-and-billing',
        'https://www.bswhealth.com/specialties/imaging-and-radiology',
        'https://requestmanager.healthmark-group.com/register',
      ]),
    );
  });

  it('narrows a pinned records page to direct records links', () => {
    const expanded = expandCandidateLinks({
      document,
      allowedDomain: 'bswhealth.com',
      mode: 'records_page',
    });

    expect(expanded.map((link) => link.url)).toEqual([
      'https://www.bswhealth.com/-/media/project/bsw/sites/bswhealth/documents/patient-tools/authorization-for-release-of-medical-information-to-bswh.pdf',
      'https://requestmanager.healthmark-group.com/register',
      'https://my.bswhealth.com/login',
    ]);
  });
});
