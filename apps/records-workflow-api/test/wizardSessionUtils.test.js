import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASCENSION_SETON_WIZARD_URL,
  buildPublicWizardSession,
  buildWizardInteractionId,
  normalizeSupportedWizardLaunchUrl,
  stripDecorativeWizardText,
} from '../src/services/wizardSessionUtils.js';

test('normalizeSupportedWizardLaunchUrl accepts the supported Ascension Seton launcher', () => {
  assert.equal(
    normalizeSupportedWizardLaunchUrl(ASCENSION_SETON_WIZARD_URL),
    ASCENSION_SETON_WIZARD_URL,
  );
});

test('normalizeSupportedWizardLaunchUrl rejects unsupported launchers', () => {
  assert.throws(
    () => normalizeSupportedWizardLaunchUrl('https://www.swellbox.com/some-other-wizard.html'),
    /not supported/i,
  );
});

test('stripDecorativeWizardText removes trailing decorative icon text', () => {
  assert.equal(stripDecorativeWizardText("Ascension Seton Northwest done"), 'Ascension Seton Northwest');
});

test('buildWizardInteractionId produces stable compact ids', () => {
  assert.equal(
    buildWizardInteractionId('option', 3, 'Ascension Seton Northwest'),
    'option:3:ascension-seton-northwest',
  );
});

test('buildPublicWizardSession sanitizes internal action metadata', () => {
  const session = {
    id: 'session-1',
    launchUrl: ASCENSION_SETON_WIZARD_URL,
    resolvedWizardUrl: 'https://healthcare.healthrecordwizard.com/wizard.html?tag=ascension_texas_seton',
    updatedAt: '2026-03-27T18:00:00.000Z',
    lastSnapshot: {
      kind: 'slide',
      slideName: 'facility-selection',
      prompt: 'Great, which location would you like to request from first?',
      notes: ['Choose one location to continue.'],
      options: [
        {
          id: 'option:0:ascension-seton-northwest',
          label: 'Ascension Seton Northwest',
          kind: 'radio',
          selected: false,
          disabled: false,
          meta: { index: 0 },
        },
      ],
      fields: [],
      actions: [
        {
          id: 'action:0:next',
          label: 'Next',
          disabled: false,
          style: 'primary',
          meta: { actionAttr: 'next' },
        },
      ],
      primaryActionId: 'action:0:next',
      manualRequiredReason: null,
      isComplete: false,
    },
  };

  assert.deepEqual(buildPublicWizardSession(session), {
    id: 'session-1',
    launch_url: ASCENSION_SETON_WIZARD_URL,
    resolved_wizard_url:
      'https://healthcare.healthrecordwizard.com/wizard.html?tag=ascension_texas_seton',
    status: 'awaiting_input',
    updated_at: '2026-03-27T18:00:00.000Z',
    step: {
      kind: 'slide',
      slideName: 'facility-selection',
      prompt: 'Great, which location would you like to request from first?',
      notes: ['Choose one location to continue.'],
      options: [
        {
          id: 'option:0:ascension-seton-northwest',
          label: 'Ascension Seton Northwest',
          kind: 'radio',
          selected: false,
          disabled: false,
        },
      ],
      fields: [],
      primaryAction: {
        id: 'action:0:next',
        label: 'Next',
        disabled: false,
        style: 'primary',
      },
      secondaryActions: [],
      manualRequiredReason: null,
      isComplete: false,
    },
  });
});
