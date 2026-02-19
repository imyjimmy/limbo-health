import { readDirectory, type DirItem } from '../../../core/binder/DirectoryReader';
import { EncryptedIO } from '../../../core/binder/EncryptedIO';
import { clearAll } from '../../../core/binder/BinderCache';
import { createMockDirFS, createMockEncryptedFS } from '../../helpers/mockFS';
import { TEST_CONVERSATION_KEY } from '../../helpers/testKeys';
import { makeDocument } from '../../helpers/testData';

beforeEach(() => {
  clearAll();
});

// Helper: create an EncryptedIO backed by an in-memory FS, pre-seeded with documents.
function createTestIO() {
  const encFS = createMockEncryptedFS();
  const io = new EncryptedIO(encFS, TEST_CONVERSATION_KEY, '/repo');
  return { io, encFS };
}

describe('readDirectory', () => {
  test('returns empty array for nonexistent directory', async () => {
    const dirFS = createMockDirFS({});
    const { io } = createTestIO();
    const result = await readDirectory('/nonexistent', dirFS, io);
    expect(result).toEqual([]);
  });

  test('returns empty array for directory with only dotfiles', async () => {
    const dirFS = createMockDirFS({
      '/': 'dir',
      '/.git': 'dir',
      '/.gitignore': 'file',
    });
    const { io } = createTestIO();
    const result = await readDirectory('/', dirFS, io);
    expect(result).toEqual([]);
  });

  test('filters out .enc sidecar files', async () => {
    const dirFS = createMockDirFS({
      '/photos': 'dir',
      '/photos/img.json': 'file',
      '/photos/img.enc': 'file',
    });
    const { io } = createTestIO();
    // Pre-seed the encrypted document so readDocument succeeds
    await io.writeDocument('/photos/img.json', makeDocument({ type: 'attachment_ref' }));

    const result = await readDirectory('/photos', dirFS, io);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('img.json');
  });

  test('filters patient-info.json at root but shows it in subdirectories', async () => {
    const dirFS = createMockDirFS({
      '/': 'dir',
      '/patient-info.json': 'file',
      '/conditions': 'dir',
      '/conditions/patient-info.json': 'file',
    });
    const { io } = createTestIO();
    await io.writeDocument('/conditions/patient-info.json', makeDocument({ type: 'patient-info' }));

    const rootResult = await readDirectory('/', dirFS, io);
    // Root should not contain patient-info.json
    expect(rootResult.find(i => i.name === 'patient-info.json')).toBeUndefined();
    // conditions folder should be present (has visible child: patient-info.json)
    expect(rootResult.find(i => i.name === 'conditions')).toBeDefined();

    const condResult = await readDirectory('/conditions', dirFS, io);
    expect(condResult.find(i => i.name === 'patient-info.json')).toBeDefined();
  });

  test('folders sorted before entries', async () => {
    const dirFS = createMockDirFS({
      '/': 'dir',
      '/z-note.json': 'file',
      '/a-folder': 'dir',
      '/a-folder/child.json': 'file',
    });
    const { io } = createTestIO();
    await io.writeDocument('/z-note.json', makeDocument());

    const result = await readDirectory('/', dirFS, io);
    expect(result.length).toBe(2);
    expect(result[0].kind).toBe('folder');
    expect(result[0].name).toBe('a-folder');
    expect(result[1].kind).toBe('entry');
    expect(result[1].name).toBe('z-note.json');
  });

  test('folders with no visible children are excluded', async () => {
    const dirFS = createMockDirFS({
      '/': 'dir',
      '/empty-folder': 'dir',
      '/hidden-only': 'dir',
      '/hidden-only/.gitkeep': 'file',
    });
    const { io } = createTestIO();

    const result = await readDirectory('/', dirFS, io);
    expect(result).toEqual([]);
  });

  test('folders with .meta.json only are included (meta.json counts as visible child)', async () => {
    const dirFS = createMockDirFS({
      '/': 'dir',
      '/labeled': 'dir',
      '/labeled/.meta.json': 'file',
    });
    const { io } = createTestIO();
    await io.writeJSON('/labeled/.meta.json', { displayName: 'Labeled Folder' });

    const result = await readDirectory('/', dirFS, io);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('folder');
    expect((result[0] as any).meta?.displayName).toBe('Labeled Folder');
  });

  test('.meta.json decryption failure falls back to no metadata', async () => {
    const dirFS = createMockDirFS({
      '/': 'dir',
      '/broken-meta': 'dir',
      '/broken-meta/.meta.json': 'file',
      '/broken-meta/child.json': 'file',
    });
    // Don't write any encrypted content for .meta.json — readJSON will fail
    const { io } = createTestIO();
    await io.writeDocument('/broken-meta/child.json', makeDocument());

    const result = await readDirectory('/', dirFS, io);
    const folder = result.find(i => i.name === 'broken-meta');
    expect(folder).toBeDefined();
    expect(folder!.kind).toBe('folder');
    expect((folder as any).meta).toBeUndefined();
  });

  test('entries have preview with title extracted from document', async () => {
    const dirFS = createMockDirFS({
      '/visits': 'dir',
      '/visits/2026-01-15-follow-up.json': 'file',
    });
    const { io } = createTestIO();
    await io.writeDocument(
      '/visits/2026-01-15-follow-up.json',
      makeDocument({ value: '# Follow-up Visit\n\nPatient doing well.' }),
    );

    const result = await readDirectory('/visits', dirFS, io);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('entry');
    if (result[0].kind === 'entry') {
      expect(result[0].preview?.title).toBe('Follow-up Visit');
      expect(result[0].preview?.type).toBe('visit');
    }
  });

  test('entry with decryption failure has null preview', async () => {
    const dirFS = createMockDirFS({
      '/visits': 'dir',
      '/visits/corrupted.json': 'file',
    });
    // Don't write encrypted content — readDocument will fail
    const { io } = createTestIO();

    const result = await readDirectory('/visits', dirFS, io);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('entry');
    if (result[0].kind === 'entry') {
      expect(result[0].preview).toBeNull();
    }
  });

  test('childCount excludes dotfiles and .enc files', async () => {
    const dirFS = createMockDirFS({
      '/': 'dir',
      '/conditions': 'dir',
      '/conditions/.meta.json': 'file',
      '/conditions/.gitkeep': 'file',
      '/conditions/note1.json': 'file',
      '/conditions/note2.json': 'file',
      '/conditions/photo.enc': 'file',
    });
    const { io } = createTestIO();
    await io.writeJSON('/conditions/.meta.json', { displayName: 'Conditions' });

    const result = await readDirectory('/', dirFS, io);
    const folder = result.find(i => i.name === 'conditions');
    expect(folder).toBeDefined();
    if (folder?.kind === 'folder') {
      // Should count note1.json and note2.json only (not .meta.json, .gitkeep, photo.enc)
      expect(folder.childCount).toBe(2);
    }
  });

  test('entries are sorted alphabetically (date-prefixed = chronological)', async () => {
    const dirFS = createMockDirFS({
      '/visits': 'dir',
      '/visits/2026-02-01-checkup.json': 'file',
      '/visits/2026-01-01-initial.json': 'file',
      '/visits/2026-03-01-follow-up.json': 'file',
    });
    const { io } = createTestIO();
    await io.writeDocument('/visits/2026-02-01-checkup.json', makeDocument({ value: '# Checkup' }));
    await io.writeDocument('/visits/2026-01-01-initial.json', makeDocument({ value: '# Initial' }));
    await io.writeDocument('/visits/2026-03-01-follow-up.json', makeDocument({ value: '# Follow-up' }));

    const result = await readDirectory('/visits', dirFS, io);
    const names = result.map(i => i.name);
    expect(names).toEqual([
      '2026-01-01-initial.json',
      '2026-02-01-checkup.json',
      '2026-03-01-follow-up.json',
    ]);
  });
});
