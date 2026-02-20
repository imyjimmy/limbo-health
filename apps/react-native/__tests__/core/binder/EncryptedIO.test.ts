import { EncryptedIO } from '../../../core/binder/EncryptedIO';
import { clearAll } from '../../../core/binder/BinderCache';
import { createMockEncryptedFS } from '../../helpers/mockFS';
import { TEST_CONVERSATION_KEY } from '../../helpers/testKeys';
import { makeDocument } from '../../helpers/testData';
import type { MedicalDocument } from '../../../types/document';

beforeEach(() => {
  clearAll();
});

function createIO() {
  const mockFS = createMockEncryptedFS();
  const io = new EncryptedIO(mockFS, TEST_CONVERSATION_KEY, '/repo');
  return { io, mockFS };
}

describe('EncryptedIO', () => {
  describe('writeDocument + readDocument round-trip', () => {
    test('round-trip returns identical MedicalDocument', async () => {
      const { io } = createIO();
      const doc = makeDocument({ value: '# Visit\n\nPatient reported improvement.' });

      await io.writeDocument('/visits/note.json', doc);
      const result = await io.readDocument('/visits/note.json');

      expect(result).toEqual(doc);
    });

    test('ciphertext on disk is not plaintext', async () => {
      const { io, mockFS } = createIO();
      const doc = makeDocument({ value: '# Secret Data' });

      await io.writeDocument('/note.json', doc);

      const onDisk = mockFS.store.get('/note.json') as string;
      expect(onDisk).toBeDefined();
      expect(onDisk).not.toContain('Secret Data');
      expect(onDisk).not.toContain('"value"');
    });

    test('readDocument returns cached value on second call (no FS read)', async () => {
      const { io, mockFS } = createIO();
      const doc = makeDocument();

      await io.writeDocument('/note.json', doc);

      // Remove from mock FS to prove cache is used
      mockFS.store.delete('/note.json');

      const result = await io.readDocument('/note.json');
      expect(result).toEqual(doc);
    });

    test('writeDocument populates cache for subsequent readDocument', async () => {
      const { io, mockFS } = createIO();
      const doc = makeDocument({ value: '# Cached' });

      await io.writeDocument('/cached.json', doc);

      // Corrupt the on-disk data to prove readDocument uses cache
      mockFS.store.set('/cached.json', 'corrupted-data');

      const result = await io.readDocument('/cached.json');
      expect(result).toEqual(doc);
    });
  });

  describe('writeJSON + readJSON round-trip', () => {
    test('round-trip for arbitrary JSON objects', async () => {
      const { io } = createIO();
      const meta = { displayName: 'Back Acne', icon: 'skin', color: '#ff0000' };

      await io.writeJSON('/conditions/back-acne/.meta.json', meta);
      const result = await io.readJSON<typeof meta>('/conditions/back-acne/.meta.json');

      expect(result).toEqual(meta);
    });

    test('readJSON caches on first read', async () => {
      const { io, mockFS } = createIO();
      const obj = { key: 'value' };

      await io.writeJSON('/data.json', obj);
      mockFS.store.delete('/data.json'); // remove from FS

      const result = await io.readJSON('/data.json');
      expect(result).toEqual(obj);
    });
  });

  describe('readDocument error cases', () => {
    test('readDocument throws on missing file', async () => {
      const { io } = createIO();
      await expect(io.readDocument('/nonexistent.json')).rejects.toThrow('ENOENT');
    });
  });

  describe('writeSidecar + readSidecar round-trip', () => {
    test('round-trip preserves binary data', async () => {
      const { io } = createIO();
      const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header

      await io.writeSidecar('/photo.enc', binaryData);
      const result = await io.readSidecar('/photo.enc');

      expect(result).toEqual(binaryData);
    });

    test('sidecar on disk is not plaintext', async () => {
      const { io, mockFS } = createIO();
      const data = new TextEncoder().encode('hello world');

      await io.writeSidecar('/file.enc', data);

      const onDisk = mockFS.store.get('/file.enc');
      expect(onDisk).toBeDefined();
      // Should be Uint8Array (DEK format), not a plain string
      expect(onDisk).toBeInstanceOf(Uint8Array);
    });
  });

  describe('explicit key operations', () => {
    test('readDocumentWithKey / writeDocumentWithKey round-trip', async () => {
      const { io } = createIO();
      const doc = makeDocument({ value: '# Explicit Key Test' });

      await io.writeDocumentWithKey('/explicit.json', doc, TEST_CONVERSATION_KEY);
      const result = await io.readDocumentWithKey('/explicit.json', TEST_CONVERSATION_KEY);

      expect(result).toEqual(doc);
    });
  });

  describe('rewrapSidecar', () => {
    test('rewrap preserves original binary data under new key', async () => {
      const { io, mockFS } = createIO();
      const binaryData = new Uint8Array([1, 2, 3, 4, 5]);

      await io.writeSidecar('/original.enc', binaryData);

      // Rewrap with the same key (self-rewrap) to a new path
      await io.rewrapSidecar(
        '/original.enc',
        '/rewrapped.enc',
        TEST_CONVERSATION_KEY,
        TEST_CONVERSATION_KEY,
      );

      const result = await io.readSidecar('/rewrapped.enc');
      expect(result).toEqual(binaryData);
    });
  });
});
