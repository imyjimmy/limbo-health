export interface BioProfile {
  fullName: string;
  dateOfBirth: string;
  last4Ssn: string;
  phoneNumber: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
}

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emptyBioProfile(suggestedFullName = '', suggestedEmail = ''): BioProfile {
  return {
    fullName: suggestedFullName,
    dateOfBirth: '',
    last4Ssn: '',
    phoneNumber: '',
    email: suggestedEmail,
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

export function formatLast4SsnInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 4);
}

export function isValidLast4Ssn(value: string): boolean {
  return /^\d{4}$/.test(value.trim());
}

export function isValidPhoneNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

function hasAnyMailingAddressValue(profile: BioProfile): boolean {
  return [
    profile.addressLine1,
    profile.addressLine2,
    profile.city,
    profile.state,
    profile.postalCode,
  ].some((value) => value.trim().length > 0);
}

function formatCityStatePostalLine(city: string, state: string, postalCode: string): string {
  const cityState = [city.trim(), state.trim()].filter(Boolean).join(', ');
  return [cityState, postalCode.trim()].filter(Boolean).join(' ');
}

export function validateBioProfileBasicDetails(profile: BioProfile): string | null {
  if (!profile.fullName.trim()) return 'Please enter your full name.';
  if (profile.dateOfBirth.trim() && !isValidDateOfBirth(profile.dateOfBirth.trim())) {
    return 'Please enter a valid date of birth.';
  }
  if (profile.last4Ssn.trim() && !isValidLast4Ssn(profile.last4Ssn)) {
    return 'Please enter the last 4 digits of your Social Security number.';
  }
  if (profile.phoneNumber.trim() && !isValidPhoneNumber(profile.phoneNumber)) {
    return 'Please enter a valid phone number.';
  }
  if (profile.email.trim() && !SIMPLE_EMAIL_PATTERN.test(profile.email.trim())) {
    return 'Please enter a valid email address.';
  }
  return null;
}

export function validateBioProfileAddress(profile: BioProfile): string | null {
  if (!hasAnyMailingAddressValue(profile)) return null;

  if (!profile.addressLine1.trim()) {
    return 'Please add a street address or clear the mailing address fields for now.';
  }
  if (!profile.city.trim()) {
    return 'Please add a city or clear the mailing address fields for now.';
  }
  if (!profile.state.trim()) {
    return 'Please add a state or clear the mailing address fields for now.';
  }
  if (profile.postalCode.trim().length < 5) {
    return 'Please add a valid postal code or clear the mailing address fields for now.';
  }
  return null;
}

export function validateBioProfile(profile: BioProfile): string | null {
  return validateBioProfileBasicDetails(profile) || validateBioProfileAddress(profile);
}

export function isBioProfileComplete(profile: BioProfile | null | undefined): profile is BioProfile {
  return Boolean(profile) && validateBioProfile(profile) === null;
}

export function formatMailingAddress(profile: BioProfile): string {
  const cityStatePostalLine = formatCityStatePostalLine(profile.city, profile.state, profile.postalCode);
  return [
    profile.addressLine1.trim(),
    profile.addressLine2.trim(),
    cityStatePostalLine,
  ]
    .filter(Boolean)
    .join('\n');
}

function maskAddressSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (trimmed.length <= 2) {
    return `${trimmed[0]}${'*'.repeat(Math.max(trimmed.length - 1, 0))}`;
  }

  return `${trimmed[0]}${'*'.repeat(trimmed.length - 2)}${trimmed.slice(-1)}`;
}

function maskAddressLine(value: string, visibleEndingChars: number): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (trimmed.length <= visibleEndingChars + 1) {
    return `${trimmed[0]}${'*'.repeat(Math.max(trimmed.length - 1, 0))}`;
  }

  return `${trimmed[0]}${'*'.repeat(trimmed.length - 1 - visibleEndingChars)}${trimmed.slice(
    -visibleEndingChars,
  )}`;
}

export function formatMaskedMailingAddress(profile: BioProfile): string {
  const city = maskAddressSegment(profile.city.trim());
  const state = profile.state.trim();
  const postalCode = maskAddressSegment(profile.postalCode.trim());
  const cityStateZipLine = formatCityStatePostalLine(city, state, postalCode);

  return [
    maskAddressLine(profile.addressLine1.trim(), 2),
    maskAddressLine(profile.addressLine2.trim(), 1),
    cityStateZipLine,
  ]
    .filter(Boolean)
    .join('\n');
}
