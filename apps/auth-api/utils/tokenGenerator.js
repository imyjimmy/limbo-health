import crypto from 'crypto';

export function generateScanToken() {
  return 'sctk_' + crypto.randomBytes(32).toString('hex');
}