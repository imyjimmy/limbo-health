# Spike: Hermes Compatibility Validation

**Goal:** Confirm that the three critical JS libraries — isomorphic-git, @noble/curves, and NIP-44 encryption — work on Hermes in an Expo React Native app talking to the production mgit-api at `limbo.health`.

**Time box:** 2 days

**Success criteria:** A bare-bones Expo app running on a physical iOS device that can:
1. Generate a Nostr keypair
2. Sign a challenge and receive a JWT from `limbo.health`
3. Create a repository via the API
4. Clone that repository using isomorphic-git over HTTP
5. Encrypt a JSON document with NIP-44, write it to the working directory
6. Commit and push the encrypted file
7. Pull, decrypt, and display the content

If all seven steps pass on Hermes with polyfills, the spike succeeds. If any step fails in a way that polyfills can't fix, document the failure and evaluate the fallback (native Git module or V8 swap).

---

## Day 1: Environment Setup + Crypto + Auth

### Step 0: Bootstrap the Expo App

```bash
npx create-expo-app hermes-spike --template blank-typescript
cd hermes-spike
```

Confirm Hermes is enabled (it's the default). Verify in `app.json`:
```json
{
  "expo": {
    "jsEngine": "hermes"
  }
}
```

Install the dependencies you'll be testing:
```bash
npx expo install expo-secure-store expo-crypto expo-file-system
npm install isomorphic-git @noble/curves @noble/hashes react-native-base64
```

Build a dev client for physical device testing — Expo Go may not be sufficient if native modules are needed:
```bash
npx expo prebuild
npx expo run:ios
```

### Step 1: Polyfill Audit

Before writing any app code, check what Hermes is missing. Create a simple screen that logs the availability of APIs the libraries need:

```typescript
// PolyfillCheck.tsx
const checkAPIs = () => {
  const results = {
    TextEncoder: typeof TextEncoder !== 'undefined',
    TextDecoder: typeof TextDecoder !== 'undefined',
    ReadableStream: typeof ReadableStream !== 'undefined',
    Buffer: typeof Buffer !== 'undefined',
    cryptoGetRandomValues: typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function',
    atob: typeof atob !== 'undefined',
    btoa: typeof btoa !== 'undefined',
  };
  console.log('API availability on Hermes:', results);
  return results;
};
```

For every `false` result, install the corresponding polyfill:

| Missing API | Polyfill | Install |
|-------------|----------|---------|
| `TextEncoder` / `TextDecoder` | `text-encoding-polyfill` | `npm install text-encoding-polyfill` |
| `ReadableStream` | `web-streams-polyfill` | `npm install web-streams-polyfill` |
| `Buffer` | `buffer` | `npm install buffer` (but prefer avoiding — use `Uint8Array` instead) |
| `crypto.getRandomValues` | `expo-crypto` + shim | See Step 2 |
| `atob` / `btoa` | `react-native-base64` or `base-64` | Already installed |

Create a `polyfills.ts` file that runs before anything else:

```typescript
// polyfills.ts — import this at the top of App.tsx
import 'text-encoding-polyfill';
import { ReadableStream } from 'web-streams-polyfill';
import { getRandomValues } from 'expo-crypto';
import { encode, decode } from 'react-native-base64';

if (typeof globalThis.ReadableStream === 'undefined') {
  globalThis.ReadableStream = ReadableStream as any;
}

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {} as Crypto;
}
if (typeof globalThis.crypto.getRandomValues === 'undefined') {
  globalThis.crypto.getRandomValues = getRandomValues as any;
}

if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = decode;
}
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = encode;
}
```

**Checkpoint:** Re-run `checkAPIs()` after polyfills load. All should be `true`.

### Step 2: Nostr Keypair Generation

Test that `@noble/curves` works on Hermes for secp256k1 key generation:

```typescript
import { schnorr, secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';

const testKeygen = () => {
  // Generate a random 32-byte private key
  const privKeyBytes = secp256k1.utils.randomPrivateKey();
  const privKeyHex = bytesToHex(privKeyBytes);

  // Derive the public key (x-only, 32 bytes, as Nostr uses)
  const pubKeyBytes = schnorr.getPublicKey(privKeyBytes);
  const pubKeyHex = bytesToHex(pubKeyBytes);

  console.log('Private key:', privKeyHex);
  console.log('Public key:', pubKeyHex);
  console.log('Key lengths valid:', privKeyHex.length === 64 && pubKeyHex.length === 64);

  return { privKeyHex, pubKeyHex };
};
```

**Pass if:** Keys generate without errors, correct lengths (64 hex chars each).

### Step 3: Schnorr Signing (Nostr Event)

Test that you can sign a Nostr-style event, since this is required for the auth challenge:

```typescript
const testSigning = (privKeyHex: string, pubKeyHex: string) => {
  const eventContent = `MGit auth challenge: test-challenge-${Date.now()}`;

  // Nostr event serialization for signing (NIP-01)
  const eventData = JSON.stringify([
    0,                          // reserved
    pubKeyHex,                  // pubkey
    Math.floor(Date.now() / 1000), // created_at
    22242,                      // kind
    [],                         // tags
    eventContent                // content
  ]);

  const eventHash = sha256(new TextEncoder().encode(eventData));
  const signature = schnorr.sign(eventHash, privKeyHex);
  const isValid = schnorr.verify(signature, eventHash, pubKeyHex);

  console.log('Signature valid:', isValid);
  return isValid;
};
```

**Pass if:** `isValid` is `true`.

### Step 4: NIP-44 Encrypt / Decrypt

Test the full NIP-44 encryption round-trip. This is the most complex crypto operation:

```typescript
import { secp256k1 } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { chacha20 } from '@noble/ciphers/chacha';
import { bytesToHex, hexToBytes, concatBytes } from '@noble/hashes/utils';

// Simplified NIP-44 v2 test (encrypt to self)
const testNIP44 = (privKeyHex: string, pubKeyHex: string) => {
  const privKeyBytes = hexToBytes(privKeyHex);
  const pubKeyBytes = hexToBytes('02' + pubKeyHex); // compressed pubkey

  // 1. ECDH shared secret
  const sharedPoint = secp256k1.getSharedSecret(privKeyBytes, pubKeyBytes);
  const sharedX = sharedPoint.slice(1, 33); // x-coordinate only

  // 2. Conversation key via HKDF
  const conversationKey = hkdf(sha256, sharedX, 'nip44-v2', '', 32);

  // 3. Random nonce
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);

  // 4. Message keys from conversation key + nonce
  const keys = hkdf(sha256, conversationKey, nonce, '', 76);
  const chachaKey = keys.slice(0, 32);
  const chachaNonce = keys.slice(32, 44);
  const hmacKey = keys.slice(44, 76);

  // 5. Pad and encrypt
  const plaintext = 'Hello from Hermes! This is a test medical record.';
  const encoded = new TextEncoder().encode(plaintext);
  const paddedLen = 32; // simplified padding for test
  const padded = new Uint8Array(2 + paddedLen);
  padded[0] = (encoded.length >> 8) & 0xff;
  padded[1] = encoded.length & 0xff;
  padded.set(encoded, 2);

  const ciphertext = chacha20(chachaKey, chachaNonce, padded);

  // 6. MAC
  const aad = concatBytes(nonce, ciphertext);
  const mac = hmac(sha256, hmacKey, aad);

  // 7. Encode payload
  const version = new Uint8Array([2]);
  const payload = concatBytes(version, nonce, ciphertext, mac);

  console.log('Encrypted payload length:', payload.length);
  console.log('NIP-44 encryption succeeded');

  // Now decrypt and verify round-trip
  // (reverse the process using same keys)
  const decCiphertext = chacha20(chachaKey, chachaNonce, ciphertext);
  const msgLen = (decCiphertext[0] << 8) | decCiphertext[1];
  const decrypted = new TextDecoder().decode(decCiphertext.slice(2, 2 + msgLen));

  console.log('Decrypted:', decrypted);
  console.log('Round-trip match:', decrypted === plaintext);

  return decrypted === plaintext;
};
```

**Pass if:** Round-trip encryption/decryption produces the original plaintext.

**Note:** This is a simplified test. The real implementation should use the `nostr-tools` NIP-44 module or the reference TS implementation from `paulmillr/nip44`. The point here is verifying the underlying primitives work on Hermes.

### Step 5: Auth Against Production

Test the full authentication flow against `limbo.health`:

```typescript
const testAuth = async (privKeyHex: string, pubKeyHex: string) => {
  const BASE_URL = 'https://limbo.health';

  // 1. Get challenge
  const challengeRes = await fetch(`${BASE_URL}/api/auth/nostr/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubkey: pubKeyHex }),
  });
  const { challenge } = await challengeRes.json();
  console.log('Got challenge:', challenge);

  // 2. Sign it (build a kind:22242 Nostr event)
  const event = {
    kind: 22242,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: `MGit auth challenge: ${challenge}`,
    pubkey: pubKeyHex,
  };

  const serialized = JSON.stringify([
    0, event.pubkey, event.created_at, event.kind, event.tags, event.content,
  ]);
  const eventHash = sha256(new TextEncoder().encode(serialized));
  const id = bytesToHex(eventHash);
  const sig = bytesToHex(schnorr.sign(eventHash, privKeyHex));

  const signedEvent = { ...event, id, sig };

  // 3. Verify and get JWT
  const verifyRes = await fetch(`${BASE_URL}/api/auth/nostr/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedEvent, challenge }),
  });
  const verifyData = await verifyRes.json();

  console.log('Auth status:', verifyData.status);
  console.log('Got JWT:', !!verifyData.token);

  return verifyData.token;
};
```

**Pass if:** JWT is returned. **Note:** This will create a new user on the server for the generated keypair. That's fine for a spike — use a throwaway key.

---

## Day 2: Git Operations + Full Round-Trip

### Step 6: Create a Repository

```typescript
const testCreateRepo = async (token: string) => {
  const BASE_URL = 'https://limbo.health';

  const res = await fetch(`${BASE_URL}/api/mgit/repos/create`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      repoName: `spike-test-${Date.now()}`,
      userName: 'Spike Test',
      userEmail: 'spike@test.local',
      description: 'Hermes compatibility spike test',
    }),
  });

  const data = await res.json();
  console.log('Repo created:', data.repoId);
  return data.repoId;
};
```

**Pass if:** Repository is created and repoId is returned.

### Step 7: Clone with isomorphic-git

This is the highest-risk step. isomorphic-git uses streams, typed arrays, and HTTP extensively.

```typescript
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import * as FileSystem from 'expo-file-system';

const testClone = async (repoId: string, token: string) => {
  const BASE_URL = 'https://limbo.health';
  const dir = `${FileSystem.documentDirectory}repos/${repoId}`;

  // Ensure directory exists
  await FileSystem.makeDirectoryAsync(dir, { recursive: true });

  // isomorphic-git needs an fs implementation
  // This is where the spike gets interesting — we need to
  // bridge expo-file-system to the fs interface isomorphic-git expects
  const fs = createLightningFS(dir); // See note below

  await git.clone({
    fs,
    http,
    dir: '/',
    url: `${BASE_URL}/api/mgit/repos/${repoId}`,
    singleBranch: true,
    depth: 1,
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    onAuth: () => ({ headers: { 'Authorization': `Bearer ${token}` } }),
  });

  // Verify clone worked
  const files = await fs.promises.readdir('/');
  console.log('Cloned files:', files);

  return files.length > 0;
};
```

**The `fs` adapter is the crux of the spike.** isomorphic-git expects a Node-style `fs` module (readFile, writeFile, mkdir, stat, readdir, unlink, symlink, etc.). In the browser, `lightning-fs` provides this over IndexedDB. On React Native, you need to bridge `expo-file-system` to this interface.

Options to evaluate during the spike:
1. **`@isomorphic-git/lightning-fs`** — may work if IndexedDB or a shim is available
2. **Custom adapter** wrapping `expo-file-system` — map each `fs` method to `FileSystem.readAsStringAsync`, `FileSystem.writeAsStringAsync`, etc.
3. **`react-native-fs`** — provides a more complete Node-like fs, but adds a native dependency

**This is the most likely failure point.** If isomorphic-git's fs requirements can't be cleanly satisfied, the fallback is the native Git module approach (which was proven in the prior prototype).

### Step 8: Write Encrypted File, Commit, Push

```typescript
const testCommitAndPush = async (
  fs: any,
  repoId: string,
  token: string,
  privKeyHex: string,
  pubKeyHex: string
) => {
  const BASE_URL = 'https://limbo.health';

  // 1. Create a test medical document
  const doc = {
    value: '# Spike Test Note\n\nThis is a test entry from the Hermes spike.',
    metadata: {
      type: 'visit',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tags: ['spike-test'],
    },
    children: [],
  };

  // 2. Encrypt it (use the NIP-44 function from Day 1)
  const plaintext = JSON.stringify(doc);
  const encrypted = nip44Encrypt(plaintext, privKeyHex, pubKeyHex);

  // 3. Write to working directory
  await fs.promises.mkdir('/visits', { recursive: true });
  const filename = `/visits/${new Date().toISOString().slice(0, 10)}-spike-test.json`;
  await fs.promises.writeFile(filename, encrypted, { encoding: 'utf8' });

  // 4. Stage
  await git.add({ fs, dir: '/', filepath: filename.slice(1) });

  // 5. Commit
  await git.commit({
    fs,
    dir: '/',
    message: 'Add spike test entry',
    author: { name: 'Spike Test', email: 'spike@test.local' },
  });

  // 6. Push
  await git.push({
    fs,
    http,
    dir: '/',
    remote: 'origin',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  console.log('Commit and push succeeded');
  return true;
};
```

### Step 9: Pull, Decrypt, Display

```typescript
const testPullAndDecrypt = async (
  fs: any,
  repoId: string,
  token: string,
  privKeyHex: string,
  pubKeyHex: string
) => {
  const BASE_URL = 'https://limbo.health';

  // 1. Pull latest
  await git.pull({
    fs,
    http,
    dir: '/',
    singleBranch: true,
    headers: { 'Authorization': `Bearer ${token}` },
    author: { name: 'Spike Test', email: 'spike@test.local' },
  });

  // 2. Read the encrypted file
  const files = await fs.promises.readdir('/visits');
  const testFile = files.find((f: string) => f.includes('spike-test'));
  const encrypted = await fs.promises.readFile(`/visits/${testFile}`, { encoding: 'utf8' });

  // 3. Decrypt
  const decrypted = nip44Decrypt(encrypted, privKeyHex, pubKeyHex);
  const doc = JSON.parse(decrypted);
  console.log('Decrypted doc:', JSON.stringify(doc).slice(0, 200));
  console.log('Decrypted document title:', doc.value.split('\n')[0]);
  console.log('Full round-trip succeeded:', doc.metadata.tags.includes('spike-test'));

  return doc;
};
```

**Pass if:** The decrypted document matches what was written in Step 8.

---

## Results Template

Fill this out at the end of the spike:

| Step | Description | Pass/Fail | Notes |
|------|-------------|-----------|-------|
| 0 | Expo app boots on Hermes | | |
| 1 | Polyfills loaded, all APIs available | | Which polyfills were needed? |
| 2 | Keypair generation | | |
| 3 | Schnorr signing | | |
| 4 | NIP-44 encrypt/decrypt round-trip | | |
| 5 | Auth against limbo.health | | |
| 6 | Create repository via API | | |
| 7 | Clone with isomorphic-git | | **Highest risk.** Document fs adapter approach. |
| 8 | Write encrypted file, commit, push | | |
| 9 | Pull, decrypt, display | | |

### If the spike fails:

Document exactly which step failed and what the error was. The most likely failure modes:

1. **isomorphic-git fs adapter doesn't work** → Fallback: native Git module (proven in prior prototype)
2. **isomorphic-git HTTP transport incompatibility** → Fallback: custom fetch-based transport adapter
3. **@noble/ciphers chacha20 fails on Hermes** → Fallback: use `noble-ciphers` WASM build or a different chacha20 library
4. **Polyfill cascade** (fixing one thing breaks another) → Fallback: evaluate V8 swap via `react-native-v8`

### If the spike passes:

Lock down the exact versions of every dependency and the polyfill configuration. This becomes the foundation for the real app. Copy the `polyfills.ts` file directly into the project.
