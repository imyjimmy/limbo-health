// core/binder/BinderService.ts
// High-level CRUD for binders. Composes EncryptedIO, FileNaming, and GitEngine.
// This is the API that hooks call — screens never touch EncryptedIO or GitEngine directly.

import { GitEngine, type GitAuthor } from '../git/GitEngine';
import { EncryptedIO } from './EncryptedIO';
import { createFSAdapter } from '../git/fsAdapter';
import {
  generateDocPath,
  sidecarPathFrom,
} from './FileNaming';
import {
  createPatientInfo,
  createPhotoRef,
  createAudioRef,
  extractEntryMetadata,
} from './DocumentModel';
import { categoryFromPath } from './categories';
import type { MedicalDocument } from '../../types/document';
import type { EntryMetadata } from './DocumentModel';
import type { AuthConfig } from '../git/httpTransport';
import { dirGet, dirSet, dirEvict, dirEvictPrefix, ptEvict, ptEvictPrefix } from './BinderCache';
import type { DirItem } from './DirectoryReader';
import { decode as b64decode } from '../crypto/base64';

// --- Types ---

export interface BinderInfo {
  repoId: string;
  repoDir: string;
  auth: AuthConfig;
  author?: GitAuthor;
}

export interface PendingSidecarWrite {
  sidecarFilename: string;
  base64Data: string;
}

// --- BinderService ---

export class BinderService {
  private io: EncryptedIO;
  private info: BinderInfo;

  constructor(info: BinderInfo, masterConversationKey: Uint8Array) {
    this.info = info;
    const fs = createFSAdapter(info.repoDir);
    this.io = new EncryptedIO(fs, masterConversationKey, info.repoDir);
  }

  private dirCacheKey(dirPath: string): string {
    const normalized = dirPath.startsWith('/') ? dirPath.slice(1) : dirPath;
    return `${this.info.repoDir}:${normalized}`;
  }

  private parentDirCacheKey(path: string): string {
    const lastSlash = path.lastIndexOf('/');
    const parent = lastSlash <= 0 ? '' : path.substring(0, lastSlash);
    return this.dirCacheKey(parent);
  }

  private normalizeDirPath(dirPath: string): string {
    return dirPath.replace(/^\/+|\/+$/g, '');
  }

  private dirFsPath(dirPath: string): string {
    const normalized = this.normalizeDirPath(dirPath);
    return normalized ? '/' + normalized : '/';
  }

  private async nextDisplayOrder(dirPath: string): Promise<number> {
    const fs = createFSAdapter(this.info.repoDir);
    const fsPath = this.dirFsPath(dirPath);

    let names: string[];
    try {
      names = await fs.promises.readdir(fsPath);
    } catch {
      return 0;
    }

    const candidates = names.filter((name) => {
      if (name.startsWith('.')) return false;
      if (name.endsWith('.enc')) return false;
      if (name === 'patient-info.json' && fsPath === '/') return false;
      return true;
    });

    let maxOrder = -1;

    for (const name of candidates) {
      const childPath = fsPath === '/' ? `/${name}` : `${fsPath}/${name}`;
      try {
        const stat = await fs.promises.stat(childPath);
        if (stat.isDirectory()) {
          try {
            const meta = await this.io.readJSON<{ displayOrder?: number }>(`${childPath}/.meta.json`);
            if (typeof meta.displayOrder === 'number' && Number.isFinite(meta.displayOrder)) {
              maxOrder = Math.max(maxOrder, meta.displayOrder);
            }
          } catch {
            // Folder has no readable metadata order.
          }
          continue;
        }

        if (name.endsWith('.json')) {
          try {
            const doc = await this.io.readDocument(childPath);
            const order = doc.metadata.displayOrder;
            if (typeof order === 'number' && Number.isFinite(order)) {
              maxOrder = Math.max(maxOrder, order);
            }
          } catch {
            // Entry unreadable — ignore for ordering baseline.
          }
        }
      } catch {
        // Child disappeared while scanning.
      }
    }

    return maxOrder + 1;
  }

  private async ensureEntryDisplayOrder(dirPath: string, doc: MedicalDocument): Promise<MedicalDocument> {
    if (typeof doc.metadata.displayOrder === 'number' && Number.isFinite(doc.metadata.displayOrder)) {
      return doc;
    }
    const displayOrder = await this.nextDisplayOrder(dirPath);
    return {
      ...doc,
      metadata: {
        ...doc.metadata,
        displayOrder,
      },
    };
  }

  private async preserveEntryDisplayOrder(entryPath: string, doc: MedicalDocument): Promise<MedicalDocument> {
    if (typeof doc.metadata.displayOrder === 'number' && Number.isFinite(doc.metadata.displayOrder)) {
      return doc;
    }

    try {
      const existing = await this.io.readDocument('/' + entryPath);
      if (
        typeof existing.metadata.displayOrder === 'number'
        && Number.isFinite(existing.metadata.displayOrder)
      ) {
        return {
          ...doc,
          metadata: {
            ...doc.metadata,
            displayOrder: existing.metadata.displayOrder,
          },
        };
      }
    } catch {
      // Existing document not readable.
    }

    return doc;
  }

  /** Synchronous cache peek — returns cached items or undefined. */
  peekDirCache(dirPath: string): DirItem[] | undefined {
    return dirGet(this.dirCacheKey(dirPath));
  }

  // --- Create ---

  /**
   * Initialize a new binder: git init, write encrypted patient-info.json, commit, push.
   */
  /** Default folder structure created with every new binder. */
  private static readonly DEFAULT_FOLDERS: {
    folder: string;
    displayName: string;
    icon: string;
    displayOrder?: number;
  }[] = [
    { folder: 'my-info',       displayName: 'My Info',       icon: '👤', displayOrder: 0 },
    { folder: 'my-info/allergies',     displayName: 'Allergies',     icon: '🤧' },
    { folder: 'my-info/immunizations', displayName: 'Immunizations', icon: '💉' },
    { folder: 'my-info/billing-insurance',displayName: 'Billing & Insurance',icon: '🪪' },
    { folder: 'conditions',    displayName: 'Conditions',    icon: '❤️‍🩹', displayOrder: 1 },
    { folder: 'medications',   displayName: 'Medications',   icon: '💊', displayOrder: 2 },
    { folder: 'visits',        displayName: 'Visits',        icon: '🩺', displayOrder: 3 },
    { folder: 'procedures',    displayName: 'Procedures',    icon: '🔪', displayOrder: 4 },
    { folder: 'labs-imaging',  displayName: 'Labs & Imaging',icon: '🔬', displayOrder: 5 },
  ];

  static async create(
    repoDir: string,
    repoId: string,
    auth: AuthConfig,
    masterConversationKey: Uint8Array,
    patientName: string,
    dateOfBirth?: string,
    author?: GitAuthor,
  ): Promise<void> {
    await GitEngine.initBinder(repoDir, author);
    await GitEngine.addRemote(repoDir, repoId);

    const fs = createFSAdapter(repoDir);
    const io = new EncryptedIO(fs, masterConversationKey, repoDir);

    const doc = createPatientInfo(patientName, dateOfBirth);
    await io.writeDocument('/patient-info.json', doc);

    const filesToCommit = ['patient-info.json'];

    // Create default folder hierarchy with .meta.json
    const nextByParent = new Map<string, number>();
    for (const { folder, displayName, icon, displayOrder: explicitOrder } of BinderService.DEFAULT_FOLDERS) {
      const parts = folder.split('/').filter(Boolean);
      parts.pop();
      const parentDir = parts.join('/');
      const displayOrder = typeof explicitOrder === 'number'
        ? explicitOrder
        : (nextByParent.get(parentDir) ?? 0);
      nextByParent.set(parentDir, Math.max(nextByParent.get(parentDir) ?? 0, displayOrder + 1));

      const metaPath = `${folder}/.meta.json`;
      await io.writeJSON('/' + metaPath, {
        displayName,
        icon,
        color: '#7F8C8D',
        displayOrder,
      });
      filesToCommit.push(metaPath);
    }

    await GitEngine.commitEntry(repoDir, filesToCommit, 'Initialize binder', author);
    await GitEngine.push(repoDir, repoId, auth);
  }

  // --- Read ---

  /**
   * List all entries in the binder, optionally filtered by category.
   * Returns lightweight metadata — does NOT decrypt full document content.
   */
  async listEntries(category?: string): Promise<EntryMetadata[]> {
    const files = await GitEngine.listFiles(this.info.repoDir);
    const jsonFiles = files.filter(
      (f) => f.endsWith('.json') && !f.startsWith('.'),
    );

    const filtered = category
      ? jsonFiles.filter((f) => categoryFromPath(f) === category)
      : jsonFiles;

    const entries: EntryMetadata[] = [];

    for (const filePath of filtered) {
      try {
        const doc = await this.io.readDocument('/' + filePath);
        entries.push(extractEntryMetadata(filePath, doc));
      } catch (err) {
        console.warn(`Skipping unreadable file: ${filePath}`, err);
      }
    }

    // Sort newest first
    entries.sort((a, b) => b.created.localeCompare(a.created));
    return entries;
  }

  /**
   * Read and decrypt a full document entry.
   */
  async readEntry(entryPath: string): Promise<MedicalDocument> {
    return this.io.readDocument('/' + entryPath);
  }

  /**
   * Read and decrypt a sidecar binary file (e.g., JPEG photo).
   */
  async readSidecar(sidecarPath: string): Promise<Uint8Array> {
    return this.io.readSidecar('/' + sidecarPath);
  }

  // --- Directory browsing ---

  /**
   * Read and classify contents of a directory within the binder.
   * Used by the DirectoryList component for file-browser navigation.
   */
  async readDir(dirPath: string): Promise<DirItem[]> {
    const key = this.dirCacheKey(dirPath);
    const cached = dirGet(key);
    if (cached) return cached;

    const { readDirectory } = await import('./DirectoryReader');
    const fs = createFSAdapter(this.info.repoDir);
    const items = await readDirectory(dirPath, fs, this.io);
    dirSet(key, items);
    return items;
  }

  /**
   * Read and decrypt patient-info.json from the binder root.
   */
  async readPatientInfo(): Promise<MedicalDocument | null> {
    try {
      return await this.io.readDocument('/patient-info.json');
    } catch {
      return null;
    }
  }

  // --- Write ---

  /**
   * Add a document entry. Generates a collision-safe filename, encrypts, commits, pushes.
   */
  async addEntry(
    category: string,
    slug: string,
    doc: MedicalDocument,
  ): Promise<string> {
    const docPath = await generateDocPath(this.info.repoDir, category, slug);
    const orderedDoc = await this.ensureEntryDisplayOrder(category, doc);
    await this.io.writeDocument('/' + docPath, orderedDoc);

    await GitEngine.commitEntry(
      this.info.repoDir,
      [docPath],
      `Add ${category} entry`,
      this.info.author,
    );
    dirEvict(this.dirCacheKey(category));
    await GitEngine.push(this.info.repoDir, this.info.repoId, this.info.auth);
    return docPath;
  }

  private async resolveUniqueSidecarPath(dirPath: string, sidecarFilename: string): Promise<string> {
    const fs = createFSAdapter(this.info.repoDir);
    const slash = sidecarFilename.lastIndexOf('/');
    const normalizedName = slash >= 0 ? sidecarFilename.slice(slash + 1) : sidecarFilename;
    const dot = normalizedName.indexOf('.');
    const stem = dot >= 0 ? normalizedName.slice(0, dot) : normalizedName;
    const ext = dot >= 0 ? normalizedName.slice(dot) : '';

    const baseDir = dirPath.replace(/^\/+|\/+$/g, '');
    let candidate = baseDir ? `${baseDir}/${normalizedName}` : normalizedName;
    let counter = 2;
    while (true) {
      try {
        await fs.promises.stat('/' + candidate);
        candidate = baseDir ? `${baseDir}/${stem}-${counter}${ext}` : `${stem}-${counter}${ext}`;
        counter += 1;
      } catch {
        return candidate;
      }
    }
  }

  async addEntryWithSidecars(
    category: string,
    slug: string,
    doc: MedicalDocument,
    sidecars: PendingSidecarWrite[],
  ): Promise<string> {
    const docPath = await generateDocPath(this.info.repoDir, category, slug);
    const slash = docPath.lastIndexOf('/');
    const dirPath = slash >= 0 ? docPath.slice(0, slash) : category;
    const filesToCommit = [docPath];

    for (const sidecar of sidecars) {
      const sidecarPath = await this.resolveUniqueSidecarPath(dirPath, sidecar.sidecarFilename);
      const binaryData = b64decode(sidecar.base64Data);
      await this.io.writeSidecar('/' + sidecarPath, binaryData);
      filesToCommit.push(sidecarPath);
    }

    const orderedDoc = await this.ensureEntryDisplayOrder(dirPath, doc);
    await this.io.writeDocument('/' + docPath, orderedDoc);

    await GitEngine.commitEntry(
      this.info.repoDir,
      filesToCommit,
      `Add ${category} entry`,
      this.info.author,
    );
    dirEvict(this.dirCacheKey(category));
    await GitEngine.push(this.info.repoDir, this.info.repoId, this.info.auth);
    return docPath;
  }

  /**
   * Add a photo with sidecar. Generates both .json and .enc paths, encrypts both, commits, pushes.
   */
  async addPhoto(
    dirPath: string,
    binaryData: Uint8Array,
    sizeBytes: number,
  ): Promise<string> {
    const docPath = await generateDocPath(this.info.repoDir, dirPath, 'photo');
    const encPath = sidecarPathFrom(docPath, 'jpg');

    // Write encrypted sidecar
    await this.io.writeSidecar('/' + encPath, binaryData);

    // Write metadata document pointing to sidecar
    const baseDoc = createPhotoRef(encPath.split('/').pop()!, sizeBytes);
    const doc = await this.ensureEntryDisplayOrder(dirPath, baseDoc);
    await this.io.writeDocument('/' + docPath, doc);

    // Commit both and push
    await GitEngine.commitEntry(
      this.info.repoDir,
      [docPath, encPath],
      `Add photo`,
      this.info.author,
    );
    dirEvict(this.dirCacheKey(dirPath));
    await GitEngine.push(this.info.repoDir, this.info.repoId, this.info.auth);

    return docPath;
  }

  async addAudio(
    dirPath: string,
    binaryData: Uint8Array,
    sizeBytes: number,
    durationMs: number,
  ): Promise<string> {
    const docPath = await generateDocPath(this.info.repoDir, dirPath, 'recording');
    const encPath = sidecarPathFrom(docPath, 'm4a');

    await this.io.writeSidecar('/' + encPath, binaryData);

    const baseDoc = createAudioRef(encPath.split('/').pop()!, sizeBytes, durationMs);
    const doc = await this.ensureEntryDisplayOrder(dirPath, baseDoc);
    await this.io.writeDocument('/' + docPath, doc);

    await GitEngine.commitEntry(
      this.info.repoDir,
      [docPath, encPath],
      `Add audio recording`,
      this.info.author,
    );
    dirEvict(this.dirCacheKey(dirPath));
    await GitEngine.push(this.info.repoDir, this.info.repoId, this.info.auth);

    return docPath;
  }

  // --- Folder metadata ---

  /**
   * Create a new subfolder with .meta.json and an optional overview document.
   * Writes .meta.json (+ overview.json if provided), commits, pushes.
   */
  async createSubfolder(
    folderPath: string,
    displayName: string,
    overviewDoc?: MedicalDocument,
    meta?: { icon?: string; color?: string; displayOrder?: number },
  ): Promise<void> {
    const lastSlash = folderPath.lastIndexOf('/');
    const parentDir = lastSlash > 0 ? folderPath.slice(0, lastSlash) : '';
    const displayOrder =
      typeof meta?.displayOrder === 'number' && Number.isFinite(meta.displayOrder)
        ? meta.displayOrder
        : await this.nextDisplayOrder(parentDir);
    const metaPath = folderPath + '/.meta.json';
    const metaObj = { displayName, ...meta, displayOrder };
    await this.io.writeJSON('/' + metaPath, metaObj);

    const filesToCommit = [metaPath];

    if (overviewDoc) {
      const slug = 'overview';
      const docPath = await generateDocPath(this.info.repoDir, folderPath, slug);
      const orderedOverviewDoc = await this.ensureEntryDisplayOrder(folderPath, overviewDoc);
      await this.io.writeDocument('/' + docPath, orderedOverviewDoc);
      filesToCommit.push(docPath);
    }

    await GitEngine.commitEntry(
      this.info.repoDir,
      filesToCommit,
      `Add ${displayName}`,
      this.info.author,
    );
    dirEvict(this.parentDirCacheKey(folderPath));
    await GitEngine.push(this.info.repoDir, this.info.repoId, this.info.auth);
  }

  /**
   * Ensure a folder exists, creating it via createSubfolder if needed.
   * Returns the folderPath whether it was created or already existed.
   */
  async ensureFolder(
    folderPath: string,
    displayName: string,
    icon: string,
  ): Promise<string> {
    const fs = createFSAdapter(this.info.repoDir);
    try {
      await fs.promises.readdir('/' + folderPath);
    } catch {
      await this.createSubfolder(folderPath, displayName, undefined, { icon });
    }
    return folderPath;
  }

  // --- Delete ---

  /**
   * Delete a single entry (.json) and its .enc sidecar if one exists.
   * Git rm, commit, push.
   */
  async deleteEntry(entryPath: string): Promise<void> {
    const filesToRemove = [entryPath];
    const basePath = entryPath.replace(/\.json$/, '');

    // Check for sidecar files (.enc, .jpg.enc, .m4a.enc, etc.)
    const allFiles = await GitEngine.listFiles(this.info.repoDir);
    for (const f of allFiles) {
      if (f.startsWith(basePath) && f.endsWith('.enc')) {
        filesToRemove.push(f);
      }
    }

    await GitEngine.removeFiles(
      this.info.repoDir,
      filesToRemove,
      `Delete ${entryPath.split('/').pop()}`,
      this.info.author,
    );
    dirEvict(this.parentDirCacheKey(entryPath));
    ptEvict(`${this.info.repoDir}:/${entryPath}`);
    try {
      await GitEngine.push(this.info.repoDir, this.info.repoId, this.info.auth);
    } catch (err: any) {
      console.warn('Push failed after delete, changes saved locally:', err?.message);
    }
  }

  /**
   * Delete a folder and all its tracked contents.
   * Git rm all files under the folder, remove the directory, commit, push.
   */
  async deleteFolder(folderPath: string): Promise<void> {
    const files = await GitEngine.listFilesUnder(this.info.repoDir, folderPath);
    if (files.length === 0) return;

    await GitEngine.removeFiles(
      this.info.repoDir,
      files,
      `Delete folder ${folderPath.split('/').pop()}`,
      this.info.author,
    );

    // Try to remove the now-empty directory from disk
    const fs = createFSAdapter(this.info.repoDir);
    try {
      await fs.promises.rmdir('/' + folderPath);
    } catch {
      // Directory may already be gone or not fully empty
    }

    dirEvict(this.dirCacheKey(folderPath));
    dirEvict(this.parentDirCacheKey(folderPath));
    ptEvictPrefix(`${this.info.repoDir}:/${folderPath}`);
    try {
      await GitEngine.push(this.info.repoDir, this.info.repoId, this.info.auth);
    } catch (err: any) {
      console.warn('Push failed after delete, changes saved locally:', err?.message);
    }
  }

  // --- Update ---

  /**
   * Update an existing document entry in-place.
   * Encrypts and overwrites the file at entryPath, then commits and pushes.
   */
  async updateEntry(
    entryPath: string,
    doc: MedicalDocument,
  ): Promise<void> {
    const docToWrite = await this.preserveEntryDisplayOrder(entryPath, doc);
    await this.io.writeDocument('/' + entryPath, docToWrite);
    await GitEngine.commitEntry(
      this.info.repoDir,
      [entryPath],
      `Update ${doc.metadata.type} entry`,
      this.info.author,
    );
    dirEvict(this.parentDirCacheKey(entryPath));
    await GitEngine.push(this.info.repoDir, this.info.repoId, this.info.auth);
  }

  async updateEntryWithSidecars(
    entryPath: string,
    doc: MedicalDocument,
    sidecars: PendingSidecarWrite[],
  ): Promise<void> {
    const lastSlash = entryPath.lastIndexOf('/');
    const dirPath = lastSlash > 0 ? entryPath.slice(0, lastSlash) : '';
    const filesToCommit = [entryPath];

    for (const sidecar of sidecars) {
      const sidecarPath = await this.resolveUniqueSidecarPath(dirPath, sidecar.sidecarFilename);
      const binaryData = b64decode(sidecar.base64Data);
      await this.io.writeSidecar('/' + sidecarPath, binaryData);
      filesToCommit.push(sidecarPath);
    }

    const docToWrite = await this.preserveEntryDisplayOrder(entryPath, doc);
    await this.io.writeDocument('/' + entryPath, docToWrite);
    await GitEngine.commitEntry(
      this.info.repoDir,
      filesToCommit,
      `Update ${doc.metadata.type} entry`,
      this.info.author,
    );
    dirEvict(this.parentDirCacheKey(entryPath));
    await GitEngine.push(this.info.repoDir, this.info.repoId, this.info.auth);
  }

  // --- Debug ---

  /**
   * List all committed files in the binder repo (for debug views).
   */
  async listAllFiles(): Promise<string[]> {
    return GitEngine.listFiles(this.info.repoDir);
  }

  // --- Sync ---

  /**
   * Pull latest from remote. Call on binder open.
   */
  async pull(): Promise<void> {
    await GitEngine.pull(
      this.info.repoDir,
      this.info.repoId,
      this.info.auth,
      this.info.author,
    );
    dirEvictPrefix(`${this.info.repoDir}:`);
    ptEvictPrefix(`${this.info.repoDir}:`);
  }

  /**
   * Push local commits to remote.
   */
  async push(): Promise<void> {
    await GitEngine.push(
      this.info.repoDir,
      this.info.repoId,
      this.info.auth,
    );
  }
}
