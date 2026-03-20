export const HOSPITAL_SYSTEM_SEARCH_DEBOUNCE_MS = 250;

export function normalizeHospitalSystemSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
