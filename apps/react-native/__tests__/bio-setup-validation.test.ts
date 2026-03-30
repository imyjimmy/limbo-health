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
  it('uses the same step-completion module for every basic-details Done-eligible field', () => {
    const incompleteBasicDetails = {
      ...completeProfile,
      phoneNumber: '',
    };

    expect(validateBioSetupStep(1, incompleteBasicDetails)).toBe('Please enter a valid phone number.');
    expect(isBioSetupStepComplete(1, incompleteBasicDetails)).toBe(false);
    expect(shouldShowBioSetupDoneButton('dateOfBirth', incompleteBasicDetails)).toBe(false);
    expect(shouldShowBioSetupDoneButton('last4Ssn', incompleteBasicDetails)).toBe(false);
    expect(shouldShowBioSetupDoneButton('phoneNumber', incompleteBasicDetails)).toBe(false);
    expect(shouldShowBioSetupDoneButton('email', incompleteBasicDetails)).toBe(false);

    expect(isBioSetupStepComplete(1, completeProfile)).toBe(true);
    expect(shouldShowBioSetupDoneButton('dateOfBirth', completeProfile)).toBe(true);
    expect(shouldShowBioSetupDoneButton('last4Ssn', completeProfile)).toBe(true);
    expect(shouldShowBioSetupDoneButton('phoneNumber', completeProfile)).toBe(true);
    expect(shouldShowBioSetupDoneButton('email', completeProfile)).toBe(true);
  });

  it('reuses the same step-completion module for the address postal code Done behavior', () => {
    const incompleteAddress = {
      ...completeProfile,
      postalCode: '',
    };

    expect(validateBioSetupStep(2, incompleteAddress)).toBe('Please enter a valid postal code.');
    expect(isBioSetupStepComplete(2, incompleteAddress)).toBe(false);
    expect(shouldShowBioSetupDoneButton('postalCode', incompleteAddress)).toBe(false);

    expect(isBioSetupStepComplete(2, completeProfile)).toBe(true);
    expect(shouldShowBioSetupDoneButton('postalCode', completeProfile)).toBe(true);
  });
});
