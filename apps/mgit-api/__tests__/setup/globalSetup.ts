/**
 * tests/setup/globalSetup.ts
 *
 * Runs once before all test suites via vitest setupFiles.
 * Generates secp256k1 keypairs for two test users and exports them.
 */
import { schnorr } from '@noble/curves/secp256k1.js';
<<<<<<<< HEAD:apps/mgit-api/__tests__/setup/globalSetup.ts
import { bytesToHex, randomBytes } from '@noble/hashes/utils';
========
import { bytesToHex, randomBytes } from '@noble/hashes/utils.js';
>>>>>>>> delete-binder:apps/auth-api/__tests__/setup/globalSetup.ts
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import 'fake-indexeddb/auto';

// Load .env.test from tests directory
dotenv.config({ path: resolve(__dirname, '../.env.test') });

// ── Primary test user (patient) ──────────────────────────────────────
const privKeyBytes1 = randomBytes(32);
export const TEST_PRIVKEY = bytesToHex(privKeyBytes1);
export const TEST_PUBKEY = bytesToHex(schnorr.getPublicKey(privKeyBytes1));

// ── Secondary test user (for unauthorized-access tests) ──────────────
const privKeyBytes2 = randomBytes(32);
export const TEST_PRIVKEY_2 = bytesToHex(privKeyBytes2);
export const TEST_PUBKEY_2 = bytesToHex(schnorr.getPublicKey(privKeyBytes2));

// ── Gateway base URL ─────────────────────────────────────────────────
export const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3003';

// ── Registry of repos created during this run (for cleanup) ──────────
export const createdRepoIds: string[] = [];

export function registerRepoForCleanup(repoId: string) {
  if (!createdRepoIds.includes(repoId)) {
    createdRepoIds.push(repoId);
  }
}

// Log on startup
console.log('\n══════════════════════════════════════════════');
console.log('  Limbo Health — Phase 1 Integration Tests');
console.log('══════════════════════════════════════════════');
console.log(`  Gateway:      ${GATEWAY_URL}`);
console.log(`  Test user 1:  ${TEST_PUBKEY.slice(0, 16)}…`);
console.log(`  Test user 2:  ${TEST_PUBKEY_2.slice(0, 16)}…`);
console.log('══════════════════════════════════════════════\n');
