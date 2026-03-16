export interface BioProfile {
  fullName: string;
  dateOfBirth: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
}

export function emptyBioProfile(suggestedFullName = ''): BioProfile {
  return {
    fullName: suggestedFullName,
    dateOfBirth: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
  };
}

export function formatDateOfBirthInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function isValidDateOfBirth(value: string): boolean {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;

  const [monthRaw, dayRaw, yearRaw] = value.split('/');
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const year = Number(yearRaw);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > new Date().getFullYear()) return false;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function isBioProfileComplete(profile: BioProfile | null | undefined): profile is BioProfile {
  if (!profile) return false;

  return (
    profile.fullName.trim().length > 0 &&
    isValidDateOfBirth(profile.dateOfBirth) &&
    profile.addressLine1.trim().length > 0 &&
    profile.city.trim().length > 0 &&
    profile.state.trim().length > 0 &&
    profile.postalCode.trim().length >= 5
  );
}

export function formatMailingAddress(profile: BioProfile): string {
  return [
    profile.addressLine1.trim(),
    profile.addressLine2.trim(),
    `${profile.city.trim()}, ${profile.state.trim()} ${profile.postalCode.trim()}`.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}
