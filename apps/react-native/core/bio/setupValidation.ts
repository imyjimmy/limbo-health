import {
  validateBioProfileAddress,
  validateBioProfileBasicDetails,
  type BioProfile,
} from '../../types/bio';

export type BioSetupStepIndex = 0 | 1 | 2;
export type BioSetupDoneFieldKey =
  | 'dateOfBirth'
  | 'last4Ssn'
  | 'phoneNumber'
  | 'email'
  | 'postalCode';

interface BioSetupStepDefinition {
  validate: ((profile: BioProfile) => string | null) | null;
  doneFields: readonly BioSetupDoneFieldKey[];
}

const BIO_SETUP_STEP_DEFINITIONS: Record<BioSetupStepIndex, BioSetupStepDefinition> = {
  0: {
    validate: null,
    doneFields: [],
  },
  1: {
    validate: validateBioProfileBasicDetails,
    doneFields: ['dateOfBirth', 'last4Ssn', 'phoneNumber', 'email'],
  },
  2: {
    validate: validateBioProfileAddress,
    doneFields: ['postalCode'],
  },
};

const DONE_FIELD_TO_STEP_INDEX = Object.entries(BIO_SETUP_STEP_DEFINITIONS).reduce<
  Partial<Record<BioSetupDoneFieldKey, BioSetupStepIndex>>
>((accumulator, [stepIndex, definition]) => {
  for (const field of definition.doneFields) {
    accumulator[field] = Number(stepIndex) as BioSetupStepIndex;
  }
  return accumulator;
}, {});

export function validateBioSetupStep(stepIndex: number, profile: BioProfile): string | null {
  const definition = BIO_SETUP_STEP_DEFINITIONS[stepIndex as BioSetupStepIndex];
  return definition?.validate ? definition.validate(profile) : null;
}

export function isBioSetupStepComplete(stepIndex: number, profile: BioProfile): boolean {
  return validateBioSetupStep(stepIndex, profile) === null;
}

export function shouldShowBioSetupDoneButton(
  field: BioSetupDoneFieldKey,
  profile: BioProfile,
): boolean {
  const stepIndex = DONE_FIELD_TO_STEP_INDEX[field];
  return typeof stepIndex === 'number' ? isBioSetupStepComplete(stepIndex, profile) : false;
}
