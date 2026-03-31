export type RecordsWizardSessionStatus = 'awaiting_input' | 'manual_required' | 'completed';

export interface RecordsWizardOption {
  id: string;
  label: string;
  kind: 'radio' | 'checkbox';
  selected: boolean;
  disabled: boolean;
}

export interface RecordsWizardFieldOption {
  value: string;
  label: string;
}

export interface RecordsWizardField {
  id: string;
  label: string;
  name: string | null;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'file' | 'checkbox';
  required: boolean;
  placeholder: string | null;
  value: string;
  supported: boolean;
  options: RecordsWizardFieldOption[];
}

export interface RecordsWizardAction {
  id: string;
  label: string;
  disabled: boolean;
  style: 'primary' | 'secondary';
}

export interface RecordsWizardStep {
  kind: 'dialog' | 'slide';
  slideName: string | null;
  prompt: string;
  notes: string[];
  options: RecordsWizardOption[];
  fields: RecordsWizardField[];
  primaryAction: RecordsWizardAction | null;
  secondaryActions: RecordsWizardAction[];
  manualRequiredReason: string | null;
  isComplete: boolean;
}

export interface RecordsWizardSession {
  id: string;
  launchUrl: string;
  resolvedWizardUrl: string | null;
  status: RecordsWizardSessionStatus;
  updatedAt: string;
  step: RecordsWizardStep | null;
}
