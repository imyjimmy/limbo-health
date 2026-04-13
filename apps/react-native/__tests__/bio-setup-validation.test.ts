import { describe, expect, it } from 'vitest';
import {
  isBioSetupStepComplete,
  shouldShowBioSetupDoneButton,
  validateBioSetupStep,
} from '../core/bio/setupValidation';
import type { BioProfile } from '../types/bio';

const completeProfile: BioProfile = {
  fullName: 'Jimmy Zhang',
  dateOfBirth: '01/14/1989',
  last4Ssn: '7116',
  phoneNumber: '2532257825',
  email: 'imyjimmy@gmail.com',
  addressLine1: '801 W 5th St',
  addressLine2: 'Apt 512',
  city: 'Austin',
  state: 'TX',
  postalCode: '78703',
};

describe('bio setup validation module', () => {
  it('treats basic-details optional fields as skippable while still validating malformed input', () => {
    const minimalBasicDetails = {
      ...completeProfile,
      dateOfBirth: '',
      last4Ssn: '',
      phoneNumber: '',
      email: '',
    };

    expect(validateBioSetupStep(1, minimalBasicDetails)).toBeNull();
    expect(isBioSetupStepComplete(1, minimalBasicDetails)).toBe(true);
    expect(shouldShowBioSetupDoneButton('dateOfBirth', minimalBasicDetails)).toBe(true);
    expect(shouldShowBioSetupDoneButton('last4Ssn', minimalBasicDetails)).toBe(true);
    expect(shouldShowBioSetupDoneButton('phoneNumber', minimalBasicDetails)).toBe(true);
    expect(shouldShowBioSetupDoneButton('email', minimalBasicDetails)).toBe(true);

    expect(
      validateBioSetupStep(1, {
        ...minimalBasicDetails,
        phoneNumber: '555-123',
      }),
    ).toBe('Please enter a valid phone number.');
  });

  it('treats the address step as optional until the user starts entering a mailing address', () => {
    const blankAddress = {
      ...completeProfile,
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postalCode: '',
    };
    const incompleteAddress = {
      ...completeProfile,
      postalCode: '',
    };

    expect(validateBioSetupStep(2, blankAddress)).toBeNull();
    expect(isBioSetupStepComplete(2, blankAddress)).toBe(true);
    expect(shouldShowBioSetupDoneButton('postalCode', blankAddress)).toBe(true);

    expect(validateBioSetupStep(2, incompleteAddress)).toBe(
      'Please add a valid postal code or clear the mailing address fields for now.',
    );
    expect(isBioSetupStepComplete(2, incompleteAddress)).toBe(false);
    expect(shouldShowBioSetupDoneButton('postalCode', incompleteAddress)).toBe(false);

    expect(isBioSetupStepComplete(2, completeProfile)).toBe(true);
    expect(shouldShowBioSetupDoneButton('postalCode', completeProfile)).toBe(true);
  });
});
