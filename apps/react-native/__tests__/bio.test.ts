import { describe, expect, it } from 'vitest';
import { formatMaskedMailingAddress, type BioProfile } from '../types/bio';

const profile: BioProfile = {
  fullName: 'Jimmy Zhang',
  dateOfBirth: '01/14/1989',
  phoneNumber: '5551234567',
  email: 'jimmy@example.com',
  addressLine1: '801 W 5th St',
  addressLine2: 'Apt 512',
  city: 'Austin',
  state: 'TX',
  postalCode: '78703',
};

describe('bio privacy helpers', () => {
  it('masks the middle of mailing address parts while preserving enough edge characters to verify', () => {
    expect(formatMaskedMailingAddress(profile)).toBe('8*********St\nA*****2\nA****n, TX 7***3');
  });
});
