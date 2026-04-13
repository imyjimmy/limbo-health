import { describe, expect, it } from 'vitest';
import {
  formatLast4SsnInput,
  formatMailingAddress,
  formatMaskedMailingAddress,
  isBioProfileComplete,
  isValidLast4Ssn,
  validateBioProfile,
  validateBioProfileAddress,
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

  it('allows optional identity fields to stay blank while still treating the profile as usable', () => {
    expect(
      validateBioProfile({
        ...profile,
        dateOfBirth: '',
        last4Ssn: '',
        phoneNumber: '',
        email: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        postalCode: '',
      }),
    ).toBeNull();
    expect(
      isBioProfileComplete({
        ...profile,
        dateOfBirth: '',
        last4Ssn: '',
        phoneNumber: '',
        email: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        postalCode: '',
      }),
    ).toBe(true);
  });

  it('still validates optional fields when the user enters them', () => {
    expect(
      validateBioProfileBasicDetails({
        ...profile,
        phoneNumber: '555-123',
      }),
    ).toBe('Please enter a valid phone number.');
    expect(
      validateBioProfileBasicDetails({
        ...profile,
        email: 'not-an-email',
      }),
    ).toBe('Please enter a valid email address.');
  });

  it('requires a mailing address to be complete if the user starts entering it', () => {
    expect(
      validateBioProfileAddress({
        ...profile,
        addressLine1: '',
      }),
    ).toBe('Please add a street address or clear the mailing address fields for now.');
    expect(
      validateBioProfileAddress({
        ...profile,
        postalCode: '',
      }),
    ).toBe('Please add a valid postal code or clear the mailing address fields for now.');
  });

  it('masks the middle of mailing address parts while preserving enough edge characters to verify', () => {
    expect(formatMaskedMailingAddress(profile)).toBe('8*********St\nA*****2\nA****n, TX 7***3');
  });

  it('returns an empty mailing address string when every address field is blank', () => {
    const blankAddressProfile = {
      ...profile,
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postalCode: '',
    };

    expect(formatMailingAddress(blankAddressProfile)).toBe('');
    expect(formatMaskedMailingAddress(blankAddressProfile)).toBe('');
  });
});
