// test-signature-determinism.tsx

import { useState } from 'react';

export function SignatureDeterminismTest() {
  const [results, setResults] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'testing' | 'done'>('idle');

  const runTest = async () => {
    if (!window.nostr) {
      setResults(['ERROR: window.nostr not available. Install nos2x or similar.']);
      return;
    }

    setStatus('testing');
    setResults([]);
    
    const pubkey = await window.nostr.getPublicKey();
    
    const fixedEvent = {
      kind: 27235,
      created_at: 0,
      tags: [],
      content: 'mgit-ed25519-derivation-seed',
      pubkey,
    };

    const signatures: string[] = [];
    const newResults: string[] = [];

    for (let i = 0; i < 10; i++) {
      const signed = await window.nostr.signEvent(fixedEvent);
      signatures.push(signed.sig);
      newResults.push(`Attempt ${i + 1}: ${signed.sig.slice(0, 32)}...`);
    }

    const allMatch = signatures.every(sig => sig === signatures[0]);
    
    if (allMatch) {
      newResults.push('✅ PASS: All 10 signatures identical. Deterministic signing confirmed.');
    } else {
      newResults.push('❌ FAIL: Signatures differ. Non-deterministic signing detected.');
      const uniqueSigs = [...new Set(signatures)];
      newResults.push(`Found ${uniqueSigs.length} unique signatures out of 10 attempts.`);
    }

    setResults(newResults);
    setStatus('done');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>Nostr Signature Determinism Test</h2>
      <button onClick={runTest} disabled={status === 'testing'}>
        {status === 'testing' ? 'Testing...' : 'Run Test (10 signatures)'}
      </button>
      <div style={{ marginTop: '20px', whiteSpace: 'pre-wrap' }}>
        {results.map((r, i) => <div key={i}>{r}</div>)}
      </div>
    </div>
  );
}