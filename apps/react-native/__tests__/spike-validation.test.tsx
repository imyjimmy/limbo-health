import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { chacha20 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';

// test
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
// import * as FileSystem from 'expo-file-system';
import { createFSAdapter } from './fsAdapter';
import './polyfills';

const testPullAndDecrypt = async (
  
  repoId: string,
  token: string,
  privKeyHex: string,
  pubKeyHex: string
) => {
  const BASE_URL = 'https://limbo.health';
  const fs = createFSAdapter(`repos/${repoId}`);
  
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
  const encrypted = await fs.promises.readFile(`/visits/${testFile}`, { encoding: 'utf8' }) as string;
  
  // 3. Decrypt
  const decrypted = nip44Decrypt(encrypted, privKeyHex, pubKeyHex);
  const doc = JSON.parse(decrypted);

  console.log('Decrypted doc:', JSON.stringify(doc).slice(0, 200));
  console.log('Decrypted document title:', doc.value.split('\n')[0]);
  console.log('Full round-trip succeeded:', doc.metadata.tags.includes('spike-test'));

  return {
    title: doc.value.split('\n')[0],
    type: doc.metadata.type,
    tags: doc.metadata.tags,
    match: doc.metadata.tags.includes('spike-test'),
  };
};

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

const testClone = async (repoId: string, token: string) => {
  const BASE_URL = 'https://limbo.health';
  const fs = createFSAdapter(`repos/${repoId}`);

  // Ensure repo directory exists
  await fs.promises.mkdir('/', { recursive: true });

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
  });

  const files = await fs.promises.readdir('/');
  console.log('Cloned files:', files);

  return files;
};

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

const nip44Encrypt = (plaintext: string, privKeyHex: string, pubKeyHex: string): string => {
  const privKeyBytes = hexToBytes(privKeyHex);
  const pubKeyBytes = hexToBytes('02' + pubKeyHex);

  // ECDH shared secret
  const sharedPoint = secp256k1.getSharedSecret(privKeyBytes, pubKeyBytes);
  const sharedX = sharedPoint.slice(1, 33);

  // Conversation key via HKDF
  const conversationKey = hkdf(sha256, sharedX, new TextEncoder().encode('nip44-v2'), new Uint8Array(), 32);

  // Random nonce
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);

  // Message keys
  const keys = hkdf(sha256, conversationKey, nonce, new Uint8Array(), 76);
  const chachaKey = keys.slice(0, 32);
  const chachaNonce = keys.slice(32, 44);
  const hmacKey = keys.slice(44, 76);

  // Pad and encrypt
  const encoded = new TextEncoder().encode(plaintext);
  const paddedLen = Math.max(32, Math.pow(2, Math.ceil(Math.log2(encoded.length))));
  const padded = new Uint8Array(2 + paddedLen);
  padded[0] = (encoded.length >> 8) & 0xff;
  padded[1] = encoded.length & 0xff;
  padded.set(encoded, 2);

  const ciphertext = chacha20(chachaKey, chachaNonce, padded);

  // MAC
  const aad = concatBytes(nonce, ciphertext);
  const mac = hmac(sha256, hmacKey, aad);

  // Encode payload as base64
  const version = new Uint8Array([2]);
  const payload = concatBytes(version, nonce, ciphertext, mac);

  // Convert to base64 string for storage
  let binary = '';
  for (let i = 0; i < payload.length; i++) {
    binary += String.fromCharCode(payload[i]);
  }
  return btoa(binary);
};

const nip44Decrypt = (payload: string, privKeyHex: string, pubKeyHex: string): string => {
  // Decode base64 payload
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  // Parse payload: version(1) + nonce(32) + ciphertext(variable) + mac(32)
  const version = bytes[0];
  if (version !== 2) throw new Error(`Unsupported NIP-44 version: ${version}`);

  const nonce = bytes.slice(1, 33);
  const mac = bytes.slice(bytes.length - 32);
  const ciphertext = bytes.slice(33, bytes.length - 32);

  // ECDH shared secret
  const privKeyBytes = hexToBytes(privKeyHex);
  const pubKeyBytes = hexToBytes('02' + pubKeyHex);
  const sharedPoint = secp256k1.getSharedSecret(privKeyBytes, pubKeyBytes);
  const sharedX = sharedPoint.slice(1, 33);

  // Conversation key
  const conversationKey = hkdf(sha256, sharedX, new TextEncoder().encode('nip44-v2'), new Uint8Array(), 32);

  // Message keys from conversation key + nonce
  const keys = hkdf(sha256, conversationKey, nonce, new Uint8Array(), 76);
  const chachaKey = keys.slice(0, 32);
  const chachaNonce = keys.slice(32, 44);
  const hmacKey = keys.slice(44, 76);

  // Verify MAC
  const aad = concatBytes(nonce, ciphertext);
  const expectedMac = hmac(sha256, hmacKey, aad);
  for (let i = 0; i < 32; i++) {
    if (mac[i] !== expectedMac[i]) throw new Error('Invalid MAC - data may be corrupted');
  }

  // Decrypt
  const padded = chacha20(chachaKey, chachaNonce, ciphertext);
  const msgLen = (padded[0] << 8) | padded[1];
  const plaintext = new TextDecoder().decode(padded.slice(2, 2 + msgLen));

  return plaintext;
};

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
  const sig = bytesToHex(schnorr.sign(eventHash, hexToBytes(privKeyHex)));

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

// Simplified NIP-44 v2 test (encrypt to self)
const testNIP44 = (privKeyHex: string, pubKeyHex: string) => {
  const privKeyBytes = hexToBytes(privKeyHex);
  const pubKeyBytes = hexToBytes('02' + pubKeyHex); // compressed pubkey

  // 1. ECDH shared secret
  const sharedPoint = secp256k1.getSharedSecret(privKeyBytes, pubKeyBytes);
  const sharedX = sharedPoint.slice(1, 33); // x-coordinate only

  // 2. Conversation key via HKDF
  const conversationKey = hkdf(sha256, sharedX, new TextEncoder().encode('nip44-v2'), new Uint8Array(), 32);

  // 3. Random nonce
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);

  // 4. Message keys from conversation key + nonce
  const keys = hkdf(sha256, conversationKey, nonce, new Uint8Array(), 76);
  const chachaKey = keys.slice(0, 32);
  const chachaNonce = keys.slice(32, 44);
  const hmacKey = keys.slice(44, 76);

  // 5. Pad and encrypt
  const plaintext = 'Hello from Hermes! This is a test medical record.';
  const encoded = new TextEncoder().encode(plaintext);
  const paddedLen = Math.max(32, Math.pow(2, Math.ceil(Math.log2(encoded.length))));
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
  const signature = schnorr.sign(eventHash, hexToBytes(privKeyHex));
  const isValid = schnorr.verify(signature, eventHash, hexToBytes(pubKeyHex));

  console.log('Signature valid:', isValid);
  return isValid;
}

const testKeygen = () => {
  try {
    const privKeyBytes = secp256k1.utils.randomSecretKey();
    const privKeyHex = bytesToHex(privKeyBytes);
    const pubKeyBytes = schnorr.getPublicKey(privKeyBytes);
    const pubKeyHex = bytesToHex(pubKeyBytes);

    return {
      success: true,
      privKeyHex,
      pubKeyHex,
      validLengths: privKeyHex.length === 64 && pubKeyHex.length === 64,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

const checkAPIs = () => {
  return {
    TextEncoder: typeof TextEncoder !== 'undefined',
    TextDecoder: typeof TextDecoder !== 'undefined',
    ReadableStream: typeof ReadableStream !== 'undefined',
    Buffer: typeof Buffer !== 'undefined',
    cryptoGetRandomValues: typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function',
    atob: typeof atob !== 'undefined',
    btoa: typeof btoa !== 'undefined',
  };
};

export default function App() {
  const [results, setResults] = useState<Record<string, boolean> | null>(null);
  const [keyResult, setKeyResult] = useState<any>(null);
  const [signResult, setSignResult] = useState<any>(null);
  const [nip44Result, setNip44Result] = useState<any>(null);
  const [authResult, setAuthResult] = useState<any>(null);
  const [repoResult, setRepoResult] = useState<any>(null);
  const [cloneResult, setCloneResult] = useState<any>(null);
  const [commitPushResult, setCommitPushResult]= useState<any>(null);
  const [pullDecryptResult, setPullDecryptResult] = useState<any>(null);

  useEffect(() => {
    setResults(checkAPIs());
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Hermes API Check</Text>
      {results && Object.entries(results).map(([api, available]) => (
        <Text key={api} style={styles.row}>
          {available ? '✅' : '❌'} {api}
        </Text>
      ))}
      <Text style={styles.title}>Step 2: Keygen</Text>
      <Text
        style={[styles.row, { color: 'blue' }]}
        onPress={() => setKeyResult(testKeygen())}
      >
        Tap to generate keypair
      </Text>
      {keyResult && (
        <>
          <Text style={styles.row}>
            {keyResult.success ? '✅' : '❌'} Keygen {keyResult.success ? 'passed' : 'failed'}
          </Text>
          {keyResult.success && (
            <>
              <Text style={styles.row}>Lengths valid: {keyResult.validLengths ? '✅' : '❌'}</Text>
              <Text style={[styles.row, { fontSize: 10 }]}>pub: {keyResult.pubKeyHex}</Text>
            </>
          )}
          {keyResult.error && <Text style={styles.row}>Error: {keyResult.error}</Text>}
        </>
        
      )}
      <Text style={styles.title}>Step 3: Schnorr Signing</Text>
      {keyResult?.success ? (
        <>
          <Text
            style={[styles.row, { color: 'blue' }]}
            onPress={() => {
              try {
                const valid = testSigning(keyResult.privKeyHex, keyResult.pubKeyHex);
                setSignResult({ success: true, valid });
              } catch (e: any) {
                setSignResult({ success: false, error: e.message });
              }
            }}
          >
            Tap to test signing
          </Text>
          {signResult && (
            <Text style={styles.row}>
              {signResult.success && signResult.valid ? '✅' : '❌'}{' '}
              {signResult.success ? `Signature valid: ${signResult.valid}` : `Error: ${signResult.error}`}
            </Text>
          )}
        </>
      ) : (
        <Text style={[styles.row, { color: 'gray' }]}>Generate keypair first</Text>
      )}
      <Text style={styles.title}>Step 4: NIP-44 Encrypt/Decrypt</Text>
      {keyResult?.success ? (
        <>
          <Text
            style={[styles.row, { color: 'blue' }]}
            onPress={() => {
              try {
                const passed = testNIP44(keyResult.privKeyHex, keyResult.pubKeyHex);
                setNip44Result({ success: true, passed });
              } catch (e: any) {
                setNip44Result({ success: false, error: e.message });
              }
            }}
          >
            Tap to test NIP-44
          </Text>
          {nip44Result && (
            <Text style={styles.row}>
              {nip44Result.success && nip44Result.passed ? '✅' : '❌'}{' '}
              {nip44Result.success
                ? `Round-trip: ${nip44Result.passed ? 'passed' : 'failed'}`
                : `Error: ${nip44Result.error}`}
            </Text>
          )}
        </>
      ) : (
        <Text style={[styles.row, { color: 'gray' }]}>Generate keypair first</Text>
      )}
      <Text style={styles.title}>Step 5: Auth JWT Retrieval</Text>
      {keyResult?.success ? (
        <>
          <Text
            style={[styles.row, { color: 'blue' }]}
            onPress={async () => {
              try {
                const token = await testAuth(keyResult.privKeyHex, keyResult.pubKeyHex);
                setAuthResult({ success: true, token });
              } catch (e: any) {
                setAuthResult({ success: false, error: e.message });
              }
            }}
          >
            Tap to test Auth
          </Text>
          {authResult && (
            <Text style={styles.row}>
              {authResult.success && authResult.token ? '✅' : '❌'}{' '}
              {authResult.success
                ? `JWT: ${authResult.token.slice(0, 12)}...`
                : `Error: ${authResult.error}`}
            </Text>
          )}
        </>
      ) : (
        <Text style={[styles.row, { color: 'gray' }]}>Generate keypair first</Text>
      )}
      <Text style={styles.title}>Step 6: Create Repo</Text>
      {authResult?.success && authResult.token ? (
        <>
          <Text
            style={[styles.row, { color: 'blue' }]}
            onPress={async () => {
              try {
                const repoId = await testCreateRepo(authResult.token);
                setRepoResult({ success: true, repoId });
              } catch (e: any) {
                setRepoResult({ success: false, error: e.message });
              }
            }}
          >
            Tap to create repo
          </Text>
          {repoResult && (
            <Text style={styles.row}>
              {repoResult.success ? '✅' : '❌'}{' '}
              {repoResult.success
                ? `Repo: ${repoResult.repoId}`
                : `Error: ${repoResult.error}`}
            </Text>
          )}
        </>
      ) : (
        <Text style={[styles.row, { color: 'gray' }]}>Authenticate first</Text>
      )}

      <Text style={styles.title}>Step 7: Clone Repo</Text>
      {repoResult?.success ? (
        <>
          <Text
            style={[styles.row, { color: 'blue' }]}
            onPress={async () => {
              try {
                const files = await testClone(repoResult.repoId, authResult.token);
                setCloneResult({ success: true, files });
              } catch (e: any) {
                setCloneResult({ success: false, error: e.message });
              }
            }}
          >
            Tap to clone repo
          </Text>
          {cloneResult && (
            <>
              <Text style={styles.row}>
                {cloneResult.success ? '✅' : '❌'}{' '}
                {cloneResult.success
                  ? `Clone passed — ${cloneResult.files.length} files`
                  : `Error: ${cloneResult.error}`}
              </Text>
              {cloneResult.success && cloneResult.files.map((f: string) => (
                <Text key={f} style={[styles.row, { fontSize: 10 }]}>  {f}</Text>
              ))}
            </>
          )}
        </>
      ) : (
        <Text style={[styles.row, { color: 'gray' }]}>Create repo first</Text>
      )}

      <Text style={styles.title}>Step 8: Commit and Push</Text>
      {repoResult?.success ? (
        <>
          <Text
            style={[styles.row, { color: 'blue' }]}
            onPress={async () => {
              try {
                const fs = createFSAdapter(`repos/${repoResult.repoId}`);
                const result = await testCommitAndPush(
                  fs,
                  repoResult.repoId,
                  authResult.token,
                  keyResult.privKeyHex,
                  keyResult.pubKeyHex
                );
                setCommitPushResult({ success: true });
              } catch (e: any) {
                setCommitPushResult({ success: false, error: e.message });
              }
            }}
          >
            Tap to commit and push
          </Text>
          {commitPushResult && (
            <Text style={styles.row}>
              {commitPushResult.success ? '✅' : '❌'}{' '}
              {commitPushResult.success
                ? 'Commit and push passed'
                : `Error: ${commitPushResult.error}`}
            </Text>
          )}
        </>
      ) : (
        <Text style={[styles.row, { color: 'gray' }]}>Create and clone repo first</Text>
      )}

      <Text style={styles.title}>Step 9: Pull, Decrypt, Display</Text>
      {commitPushResult?.success ? (
        <>
          <Text
            style={[styles.row, { color: 'blue' }]}
            onPress={async () => {
              try {
                const result = await testPullAndDecrypt(
                  repoResult.repoId,
                  authResult.token,
                  keyResult.privKeyHex,
                  keyResult.pubKeyHex
                );
                console.log('Pull decrypt result:', JSON.stringify(result));
                setPullDecryptResult({ success: true, ...result });
              } catch (e: any) {
                setPullDecryptResult({ success: false, error: e.message });
              }
            }}
          >
            Tap to pull and decrypt
          </Text>
          {pullDecryptResult && (
            <>
              <Text style={styles.row}>
                {pullDecryptResult.success && pullDecryptResult.match ? '✅' : '❌'}{' '}
                {pullDecryptResult.success
                  ? `Round-trip verified`
                  : `Error: ${pullDecryptResult.error}`}
              </Text>
              {pullDecryptResult.success && (
                <>
                  <Text style={[styles.row, { fontSize: 12 }]}>Title: {pullDecryptResult.title}</Text>
                  <Text style={[styles.row, { fontSize: 12 }]}>Type: {pullDecryptResult.type}</Text>
                  <Text style={[styles.row, { fontSize: 12 }]}>Tags: {pullDecryptResult.tags?.join(', ')}</Text>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <Text style={[styles.row, { color: 'gray' }]}>Commit and push first</Text>
      )}
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: 40,
    paddingTop: 60,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  row: {
    fontSize: 16,
    marginBottom: 8,
    fontFamily: 'monospace',
  },
});