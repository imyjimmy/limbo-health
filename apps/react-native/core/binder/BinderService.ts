// core/binder/BinderService.ts
// High-level CRUD for binders. Composes EncryptedIO, FileNaming, and GitEngine.
// This is the API that hooks call — screens never touch EncryptedIO or GitEngine directly.

import { GitEngine } from '../git/GitEngine';
import { EncryptedIO } from './EncryptedIO';
import { createFSAdapter } from '../git/fsAdapter';
import {
  generateDocPath,
  sidecarPathFrom,
  conditionFolder,
} from './FileNaming';
import {
  createPatientInfo,
  createPhotoRef,
  extractEntryMetadata,
} from './DocumentModel';
import { categoryFromPath } from './categories';
import type { MedicalDocument } from '../../types/document';
import type { EntryMetadata } from './DocumentModel';
import type { AuthConfig } from '../git/httpTransport';
import type { DirItem } from './DirectoryReader';

// --- Types ---

export interface BinderInfo {
  repoId: string;
  repoDir: string;
  auth: AuthConfig;
}

// --- BinderService ---

export class BinderService {
  private io: EncryptedIO;
  private info: BinderInfo;

  constructor(info: BinderInfo, masterConversationKey: Uint8Array) {
    this.info = info;
    const fs = createFSAdapter(info.repoDir);
    this.io = new EncryptedIO(fs, masterConversationKey);
  }

  // --- Create ---

  /**
   * Initialize a new binder: git init, write encrypted patient-info.json, commit, push.
   */
  static async create(
    repoDir: string,
    repoId: string,
    auth: AuthConfig,
    masterConversationKey: Uint8Array,
    patientName: string,
    dateOfBirth?: string,
  ): Promise<void> {
    await GitEngine.initBinder(repoDir);

    const fs = createFSAdapter(repoDir);
    const io = new EncryptedIO(fs, masterConversationKey);

    const doc = createPatientInfo(patientName, dateOfBirth);
    await io.writeDocument('/patient-info.json', doc);

    await GitEngine.commitEntry(repoDir, ['patient-info.json'], 'Initialize binder');
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
    const { readDirectory } = await import('./DirectoryReader');
    const fs = createFSAdapter(this.info.repoDir);
    return readDirectory(dirPath, fs, this.io);
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
    await this.io.writeDocument('/' + docPath, doc);
    await GitEngine.commitEntry(this.info.repoDir, [docPath], `Add ${category} entry`);
    await GitEngine.push(this.info.repoDir, this.info.repoId, this.info.auth);
    return docPath;
  }

  /**
   * Add a photo with sidecar. Generates both .json and .enc paths, encrypts both, commits, pushes.
   */
  async addPhoto(
    conditionSlug: string,
    binaryData: Uint8Array,
    sizeBytes: number,
  ): Promise<string> {
    const folder = conditionFolder(conditionSlug);
    const docPath = await generateDocPath(this.info.repoDir, folder, 'photo');
    const encPath = sidecarPathFrom(docPath);

    // Write encrypted sidecar
    await this.io.writeSidecar('/' + encPath, binaryData);

    // Write metadata document pointing to sidecar
    const doc = createPhotoRef(
      encPath.split('/').pop()!,
      sizeBytes,
      conditionSlug,
    );
    await this.io.writeDocument('/' + docPath, doc);

    // Commit both and push
    await GitEngine.commitEntry(
      this.info.repoDir,
      [docPath, encPath],
      `Add ${conditionSlug} photo`,
    );
    await GitEngine.push(this.info.repoDir, this.info.repoId, this.info.auth);

    return docPath;
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
    );
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