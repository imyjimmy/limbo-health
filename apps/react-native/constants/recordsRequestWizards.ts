export const ASCENSION_SETON_WIZARD_URL =
  'https://www.swellbox.com/ascension-texas-seton-wizard.html';

export function getRecordsRequestWizardLaunchUrl(systemName: string): string | null {
  if (systemName.trim().toLowerCase() === 'ascension seton') {
    return ASCENSION_SETON_WIZARD_URL;
  }

  return null;
}
