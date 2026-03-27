const ASCENSION_SETON_WIZARD_URL = 'https://www.swellbox.com/ascension-texas-seton-wizard.html';

export const SUPPORTED_WIZARD_LAUNCH_URLS = new Set([ASCENSION_SETON_WIZARD_URL]);

export function cleanWizardText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function stripDecorativeWizardText(value) {
  return cleanWizardText(value)
    .replace(/\bdone\b$/i, '')
    .replace(/\s+\u00d7$/, '')
    .trim();
}

export function normalizeSupportedWizardLaunchUrl(input) {
  const candidate = cleanWizardText(input);
  if (!candidate) {
    throw new Error('A supported wizard launch URL is required.');
  }

  let normalizedUrl;
  try {
    const parsed = new URL(candidate);
    parsed.hash = '';
    normalizedUrl = parsed.toString();
  } catch (_error) {
    throw new Error('Wizard launch URL must be a valid absolute URL.');
  }

  if (!SUPPORTED_WIZARD_LAUNCH_URLS.has(normalizedUrl)) {
    throw new Error('That wizard launch URL is not supported by this CloakBrowser bridge yet.');
  }

  return normalizedUrl;
}

export function buildWizardInteractionId(kind, index, label) {
  const safeLabel = cleanWizardText(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return `${kind}:${index}:${safeLabel || 'item'}`;
}

export function sanitizeWizardSnapshot(snapshot) {
  if (!snapshot) return null;

  const primaryAction =
    snapshot.primaryActionId && Array.isArray(snapshot.actions)
      ? snapshot.actions.find((action) => action.id === snapshot.primaryActionId) || null
      : null;

  return {
    kind: snapshot.kind,
    slideName: snapshot.slideName,
    prompt: snapshot.prompt,
    notes: Array.isArray(snapshot.notes) ? snapshot.notes : [],
    options: Array.isArray(snapshot.options)
      ? snapshot.options.map((option) => ({
          id: option.id,
          label: option.label,
          kind: option.kind,
          selected: Boolean(option.selected),
          disabled: Boolean(option.disabled),
        }))
      : [],
    fields: Array.isArray(snapshot.fields)
      ? snapshot.fields.map((field) => ({
          id: field.id,
          label: field.label,
          name: field.name,
          type: field.type,
          required: Boolean(field.required),
          placeholder: field.placeholder || null,
          value: field.value ?? '',
          supported: field.supported !== false,
          options: Array.isArray(field.options)
            ? field.options.map((option) => ({
                value: option.value,
                label: option.label,
              }))
            : [],
        }))
      : [],
    primaryAction: primaryAction
      ? {
          id: primaryAction.id,
          label: primaryAction.label,
          disabled: Boolean(primaryAction.disabled),
          style: primaryAction.style || 'primary',
        }
      : null,
    secondaryActions: Array.isArray(snapshot.actions)
      ? snapshot.actions
          .filter((action) => !primaryAction || action.id !== primaryAction.id)
          .map((action) => ({
            id: action.id,
            label: action.label,
            disabled: Boolean(action.disabled),
            style: action.style || 'secondary',
          }))
      : [],
    manualRequiredReason: snapshot.manualRequiredReason || null,
    isComplete: Boolean(snapshot.isComplete),
  };
}

export function buildPublicWizardSession(session) {
  return {
    id: session.id,
    launch_url: session.launchUrl,
    resolved_wizard_url: session.resolvedWizardUrl,
    status: session.lastSnapshot?.isComplete
      ? 'completed'
      : session.lastSnapshot?.manualRequiredReason
        ? 'manual_required'
        : 'awaiting_input',
    updated_at: session.updatedAt,
    step: sanitizeWizardSnapshot(session.lastSnapshot),
  };
}

export { ASCENSION_SETON_WIZARD_URL };
