export interface Service {
  id: number;
  name: string;
  price: number;
  currency: string;
  duration: number;
  description?: string;
}

export enum InvoiceStatus {
  PENDING = 'pending',
  PAID = 'paid',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

export interface PatientInfo {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  nostr_pubkey?: string;
}

export interface ProviderInfo {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  specialties?: string[];
  nostr_pubkey?: string;
}

export interface ServiceInfo {
  id: number;
  name: string;
  duration: number;
  price: number;
  description?: string;
}

export interface CreateInvoiceParams {
  appointmentId: number;
  amountSats: number;
  description: string;
  expiryMinutes?: number; // default 60 minutes
}

export interface CreateInvoiceResponse {
  success: boolean;
  invoice?: ActiveInvoice;
  error?: string;
}

export interface CheckInvoiceStatusResponse {
  status: InvoiceStatus;
  settled: boolean;
  settledAt?: Date;
  invoice?: ActiveInvoice;
}

export interface ActiveInvoice {
  appointmentId: number;
  invoiceHash: string;
  paymentRequest: string;
  amountSats: number;
  description: string;
  createdAt: Date;
  expiresAt: Date;
  status: InvoiceStatus;
  patientInfo: PatientInfo;
  serviceInfo: ServiceInfo;
  providerInfo: ProviderInfo;
  checkInterval?: NodeJS.Timeout;
}

export class BillingError extends Error {
  constructor(
    message: string,
    public code: BillingErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

export enum BillingErrorCode {
  NWC_NOT_CONNECTED = 'NWC_NOT_CONNECTED',
  INVOICE_CREATION_FAILED = 'INVOICE_CREATION_FAILED',
  INVOICE_NOT_FOUND = 'INVOICE_NOT_FOUND',
  APPOINTMENT_NOT_FOUND = 'APPOINTMENT_NOT_FOUND',
  APPOINTMENT_ALREADY_INVOICED = 'APPOINTMENT_ALREADY_INVOICED',
  INSUFFICIENT_ESCROW_BALANCE = 'INSUFFICIENT_ESCROW_BALANCE',
  ESCROW_NOT_FOUND = 'ESCROW_NOT_FOUND',
  ESCROW_CONDITIONS_NOT_MET = 'ESCROW_CONDITIONS_NOT_MET',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  EXPIRED_INVOICE = 'EXPIRED_INVOICE',
  DATABASE_ERROR = 'DATABASE_ERROR'
}

export interface Appointment {
  id: number;
  start_datetime: string;
  end_datetime: string;
  id_services: number;
  id_users_customer: number;
  id_users_provider: number;
  status: string;
  service?: Service;
  customer?: {
    id: number;
    first_name: string;
    last_name: string;
    email?: string;
    nostr_pubkey?: string;
  };
  invoiced?: boolean;
}

export interface LightningInvoice {
  payment_request: string;
  r_hash: string;
  add_index: string;
  payment_addr: string;
  value: number;
  creation_date: string;
  settled: boolean;
}

export interface InvoiceRequest {
  appointmentId: number;
  amount: number; // in sats
  description: string;
}