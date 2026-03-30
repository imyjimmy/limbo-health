import { describe, expect, it } from 'vitest';
import {
  formatLast4SsnInput,
  formatMaskedMailingAddress,
  isValidPhoneNumber,
  isValidLast4Ssn,
  validateBioProfileBasicDetails,
  type BioProfile,
} from '../types/bio';

const profile: BioProfile = {
  fullName: 'Jimmy Zhang',
  dateOfBirth: '01/14/1989',
  last4Ssn: '6789',
  phoneNumber: '5551234567',
  email: 'jimmy@example.com',
  addressLine1: '801 W 5th St',
  addressLine2: 'Apt 512',
  city: 'Austin',
  state: 'TX',
  postalCode: '78703',
};

describe('bio privacy helpers', () => {
  it('normalizes and validates the last 4 of SSN', () => {
    expect(formatLast4SsnInput('67-89')).toBe('6789');
    expect(isValidLast4Ssn('6789')).toBe(true);
    expect(isValidLast4Ssn('678')).toBe(false);
  });

  it('requires a valid phone number before the basic-details step is complete', () => {
    expect(isValidPhoneNumber('512 555 0123')).toBe(true);
    expect(
      validateBioProfileBasicDetails({
        ...profile,
        phoneNumber: '',
      }),
    ).toBe('Please enter a valid phone number.');
  });

  it('requires an email before the basic-details step is complete', () => {
    expect(
      validateBioProfileBasicDetails({
        ...profile,
        email: '',
      }),
    ).toBe('Please enter your email address.');
  });

  it('masks the middle of mailing address parts while preserving enough edge characters to verify', () => {
    expect(formatMaskedMailingAddress(profile)).toBe('8*********St\nA*****2\nA****n, TX 7***3');
  });
});
