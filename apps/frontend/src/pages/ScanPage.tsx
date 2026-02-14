// pages/ScanPage.tsx
// Doctor-side scan page: scan QR → clone staging repo → decrypt → view timeline → add note → push.
// No authentication required — the scan token from the QR code is the only auth.

import { useState, useCallback, useRef } from 'react';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import FS from '@isomorphic-git/lightning-fs';
import {
  getEphemeralConversationKey,
  decrypt,
  decryptLarge,
  encrypt,
} from '../lib/scanCrypto';
import { QRScanner, type ScanQRPayload } from '../components/scan/QRScanner';
import { MedicalTimeline, type TimelineEntry } from '../components/scan/MedicalTimeline';
import { DoctorNoteEditor } from '../components/scan/DoctorNoteEditor';

// --- Types ---

type ScanState =
  | { phase: 'idle' }
  | { phase: 'scanning' }
  | { phase: 'loading'; message: string }
  | { phase: 'viewing'; entries: TimelineEntry[] }
  | { phase: 'editing'; entries: TimelineEntry[] }
  | { phase: 'submitting'; entries: TimelineEntry[] }
  | { phase: 'done'; entries: TimelineEntry[] }
  | { phase: 'error'; message: string };

// --- Custom HTTP transport that appends scan_token as query param ---

function createScanHttp(scanToken: string) {
  return {
    async request(args: any) {
      const separator = args.url.includes('?') ? '&' : '?';
      const authedUrl = `${args.url}${separator}scan_token=${scanToken}`;
      return http.request({ ...args, url: authedUrl });
    },
  };
}

// --- File system instance for this scan session ---

const SCAN_FS_NAME = 'scan-session';

export function ScanPage() {
  const [state, setState] = useState<ScanState>({ phase: 'idle' });
  const payloadRef = useRef<ScanQRPayload | null>(null);
  const convKeyRef = useRef<Uint8Array | null>(null);
  const fsRef = useRef<FS | null>(null);
  const dirRef = useRef<string>('');

  // --- Clone + decrypt ---

  const handleScan = useCallback(async (payload: ScanQRPayload) => {
    payloadRef.current = payload;

    try {
      setState({ phase: 'loading', message: 'Deriving decryption key...' });
      const conversationKey = getEphemeralConversationKey(payload.ephemeralPrivkey);
      convKeyRef.current = conversationKey;

      // Fresh filesystem for each scan session
      const fs = new FS(SCAN_FS_NAME);
      fsRef.current = fs;
      const dir = `/${payload.repoId}`;
      dirRef.current = dir;

      // Clean up any previous session
      try {
        await fs.promises.rmdir(dir, { recursive: true } as any);
      } catch {
        // doesn't exist, fine
      }

      setState({ phase: 'loading', message: 'Cloning patient records...' });

      const scanHttp = createScanHttp(payload.sessionToken);
      const repoUrl = `${payload.endpoint}/api/mgit/repos/${payload.repoId}`;

      await git.clone({
        fs,
        http: scanHttp,
        dir,
        url: repoUrl,
        ref: 'main',
        singleBranch: true,
        depth: 50,
      });

      setState({ phase: 'loading', message: 'Decrypting records...' });

      console.log('Clone complete, listing files...');
      const files = await git.listFiles({ fs, dir, ref: 'HEAD' });
      console.log('Files found:', files);

      const jsonFiles = files.filter((f: string) => f.endsWith('.json'));
      const encFiles = new Set(files.filter((f: string) => f.endsWith('.enc')));
      console.log('JSON files:', jsonFiles);
      console.log('ENC files:', [...encFiles]);

      const entries: TimelineEntry[] = [];

      for (const jsonPath of jsonFiles) {
        try {
          const content = await fs.promises.readFile(`${dir}/${jsonPath}`, {
            encoding: 'utf8',
          }) as string;

          const plaintext = decrypt(content, conversationKey);
          const doc = JSON.parse(plaintext);

          const entry: TimelineEntry = { path: jsonPath, doc };

          // If this is an attachment_ref, decrypt the sidecar for display
          if (doc.metadata?.type === 'attachment_ref' && doc.value) {
            // doc.value is the sidecar filename like '2026-02-13-photo.enc'
            // Resolve the full sidecar path relative to the json file's directory
            const dirParts = jsonPath.split('/');
            dirParts.pop(); // remove the json filename
            const sidecarPath = [...dirParts, doc.value].join('/');

            if (encFiles.has(sidecarPath)) {
              try {
                const encContent = await fs.promises.readFile(
                  `${dir}/${sidecarPath}`,
                  { encoding: 'utf8' },
                ) as string;

                const decryptedBase64 = decryptLarge(encContent, conversationKey);
                const format = doc.metadata?.format || 'jpeg';
                entry.imageDataUrl = `data:image/${format};base64,${decryptedBase64}`;
              } catch (encErr) {
                console.error(`Failed to decrypt sidecar ${sidecarPath}:`, encErr);
              }
            }
          }

          entries.push(entry);
        } catch (err) {
          console.error(`Failed to decrypt ${jsonPath}:`, err);
        }
      }
      console.log('Entries to render:', entries.length, entries.map(e => e.path));
      setState({ phase: 'viewing', entries });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Scan flow failed:', err);
      setState({ phase: 'error', message: msg });
    }
  }, []);

  // --- Submit doctor note ---

  const handleSubmitNote = useCallback(async (noteText: string) => {
    const payload = payloadRef.current;
    const conversationKey = convKeyRef.current;
    const fs = fsRef.current;
    const dir = dirRef.current;

    if (!payload || !conversationKey || !fs || !dir) {
      setState({ phase: 'error', message: 'Session data missing.' });
      return;
    }

    // Preserve entries for display
    const currentEntries = (state as any).entries || [];
    setState({ phase: 'submitting', entries: currentEntries });

    try {
      // Build the MedicalDocument
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const doc = {
        value: noteText,
        metadata: {
          type: 'visit',
          created: now.toISOString(),
          provider: 'Doctor (via scan)',
        },
        children: [],
      };

      // Encrypt with the ephemeral conversation key
      const encrypted = encrypt(JSON.stringify(doc), conversationKey);

      // Write to the staging repo filesystem
      const notePath = `visits/${dateStr}-doctor-note.json`;

      // Ensure visits/ directory exists
      try {
        await fs.promises.mkdir(`${dir}/visits`);
      } catch {
        // already exists
      }

      await fs.promises.writeFile(`${dir}/${notePath}`, encrypted);

      // Git add + commit
      await git.add({ fs, dir, filepath: notePath });

      await git.commit({
        fs,
        dir,
        message: `Doctor note added ${dateStr}`,
        author: {
          name: 'Doctor',
          email: 'scan@limbo.health',
          timestamp: Math.floor(Date.now() / 1000),
        },
      });

      // Push with scan token auth
      const scanHttp = createScanHttp(payload.sessionToken);

      await git.push({
        fs,
        http: scanHttp,
        dir,
        remote: 'origin',
        ref: 'main',
      });

      setState({ phase: 'done', entries: currentEntries });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Note submission failed:', err);
      setState({ phase: 'error', message: `Failed to submit note: ${msg}` });
    }
  }, [state]);

  // --- Render ---

  const payload = payloadRef.current;
  console.log('Render — phase:', state.phase, 'payloadRef:', payloadRef.current);
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        {/* Idle */}
        {state.phase === 'idle' && (
          <div className="max-w-md mx-auto text-center pt-24">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Limbo Health</h1>
            <p className="text-gray-500 mb-8">
              Scan your patient's QR code to view their medical records.
              Access expires in 1 hour. No account required.
            </p>
            <button
              onClick={() => setState({ phase: 'scanning' })}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors text-lg"
            >
              Scan QR Code
            </button>
          </div>
        )}

        {/* Scanning */}
        {state.phase === 'scanning' && (
          <div className="max-w-md mx-auto pt-12">
            <h2 className="text-xl font-bold text-gray-900 text-center mb-6">
              Scan Patient QR Code
            </h2>
            <QRScanner
              onScan={handleScan}
              onError={(msg) => setState({ phase: 'error', message: msg })}
            />
            <button
              onClick={() => setState({ phase: 'idle' })}
              className="block mx-auto mt-6 text-gray-500 hover:text-gray-700 text-sm"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Loading */}
        {state.phase === 'loading' && (
          <div className="max-w-md mx-auto text-center pt-24">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-600">{state.message}</p>
          </div>
        )}

        {/* Viewing timeline */}
        {state.phase === 'viewing' && payload && (
          <div>
            <MedicalTimeline
              entries={state.entries}
              expiresAt={payload.expiresAt}
            />
            <div className="max-w-3xl mx-auto mt-8">
              <button
                onClick={() => setState({ phase: 'editing', entries: state.entries })}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors w-full"
              >
                Add Clinical Note
              </button>
            </div>
          </div>
        )}

        {/* Editing */}
        {state.phase === 'editing' && (
          <DoctorNoteEditor
            onSubmit={handleSubmitNote}
            onCancel={() => setState({ phase: 'viewing', entries: state.entries })}
            submitting={false}
          />
        )}

        {/* Submitting */}
        {state.phase === 'submitting' && (
          <DoctorNoteEditor
            onSubmit={() => {}}
            onCancel={() => {}}
            submitting={true}
          />
        )}

        {/* Done */}
        {state.phase === 'done' && (
          <div className="max-w-md mx-auto text-center pt-24">
            <div className="text-5xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Note Submitted</h2>
            <p className="text-gray-500 mb-8">
              Your clinical note has been encrypted and saved to the patient's records.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setState({ phase: 'viewing', entries: state.entries })}
                className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Back to Records
              </button>
              <button
                onClick={() => {
                  payloadRef.current = null;
                  convKeyRef.current = null;
                  setState({ phase: 'idle' });
                }}
                className="block w-full text-gray-500 hover:text-gray-700 text-sm py-2"
              >
                End Session
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {state.phase === 'error' && (
          <div className="max-w-md mx-auto text-center pt-24">
            <div className="text-5xl mb-4">⚠</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-red-600 mb-8">{state.message}</p>
            <button
              onClick={() => setState({ phase: 'idle' })}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}