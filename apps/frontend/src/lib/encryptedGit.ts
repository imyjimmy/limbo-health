import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import FS from '@isomorphic-git/lightning-fs';
import { encryptForStorage, decryptFromStorage, getNostrPublicKey } from './utils';

// Initialize in-browser filesystem
const fs = new FS('medical-repos');

export interface MedicalHistoryData {
  patientInfo: {
    createdAt: string;
    owner: string;
    description: string;
  };
  medicalHistory: {
    conditions: any[];
    medications: any[];
    allergies: any[];
    procedures: any[];
    labResults: any[];
  };
  visits: any[];
  notes: any[];
}

/**
 * Initialize a new encrypted medical repository in browser
 */
export async function createEncryptedRepo(
  repoName: string,
  userName: string,
  userEmail: string
): Promise<string> {
  const dir = `/${repoName}`;
  
  try {
    // Initialize git repo in browser memory
    await git.init({ 
      fs, 
      dir, 
      defaultBranch: 'main' 
    });
    
    console.log(`✅ Initialized local git repo: ${dir}`);
    return dir;
  } catch (error) {
    console.error('Failed to initialize repo:', error);
    throw new Error(`Failed to create repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Commit encrypted medical data to local repository with encrypted commit message
 */
export async function commitEncrypted(
  dir: string,
  filepath: string,
  data: any,
  message: string,
  author: { name: string; email: string }
): Promise<string> {
  try {
    // 1. Encrypt file data with NIP-44
    const encrypted = await encryptForStorage(data);
    
    // 2. Encrypt commit message with NIP-44
    const myPubkey = await getNostrPublicKey();
    const encryptedMessage = await window.nostr!.nip44!.encrypt(
      myPubkey,
      message
    );
    
    // 3. Write encrypted content to virtual filesystem
    await fs.promises.writeFile(`${dir}/${filepath}`, encrypted);
    console.log(`📝 Wrote encrypted file: ${filepath}`);
    
    // 4. Stage file
    await git.add({ fs, dir, filepath });
    console.log(`➕ Staged: ${filepath}`);
    
    // 5. Commit with ENCRYPTED message and anonymized author
    const sha = await git.commit({
      fs,
      dir,
      message: encryptedMessage,  // ← Encrypted commit message
      author: {
        name: myPubkey.substring(0, 8),  // ← Just pubkey fragment
        email: '',  // ← Empty to avoid leaking info
        timestamp: Math.floor(Date.now() / 1000)
      }
    });
    
    console.log(`✅ Committed with encrypted message: ${sha}`);
    return sha;
  } catch (error) {
    console.error('Failed to commit:', error);
    throw new Error(`Failed to commit: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Read git log and decrypt commit messages for display
 */
export async function getCommitLog(dir: string): Promise<any[]> {
  try {
    const commits = await git.log({ fs, dir, depth: 50 });
    const myPubkey = await getNostrPublicKey();
    
    console.log('🔑 Decrypting with pubkey:', myPubkey);
    console.log('📝 Total commits to decrypt:', commits.length);
    
    // Decrypt each commit message
    const decryptedCommits = await Promise.all(
      commits.map(async (commit, index) => {
        const encryptedMessage = commit.commit.message.trim();
        console.log(`\n--- Commit ${index + 1} ---`);
        console.log('Encrypted message:', encryptedMessage.substring(0, 50) + '...');
        
        try {
          // Check if nos2x is available
          if (!window.nostr?.nip44?.decrypt) {
            throw new Error('nos2x NIP-44 not available');
          }
          
          const decryptedMessage = await window.nostr.nip44.decrypt(
            myPubkey,
            encryptedMessage
          );
          
          console.log('✅ Decrypted:', decryptedMessage);
          
          return {
            ...commit,
            commit: {
              ...commit.commit,
              message: decryptedMessage
            }
          };
        } catch (error) {
          console.error('❌ Decryption failed for commit:', commit.oid);
          console.error('Error details:', error);
          console.error('Encrypted message length:', encryptedMessage.length);
          console.error('First 100 chars:', encryptedMessage.substring(0, 100));
          
          // Return with error marker
          return {
            ...commit,
            commit: {
              ...commit.commit,
              message: `[DECRYPTION FAILED] ${encryptedMessage.substring(0, 50)}...`,
              decryptionError: error instanceof Error ? error.message : String(error)
            }
          };
        }
      })
    );
    
    return decryptedCommits;
  } catch (error) {
    console.error('Failed to read commit log:', error);
    return [];
  }
}

/**
 * Add remote origin and push encrypted commits to server
 */
export async function pushToServer(
  dir: string,
  repoName: string,
  token: string,
  serverUrl: string = window.location.origin
): Promise<void> {
  try {
    // 1. Set remote origin
    const remoteUrl = `${serverUrl}/api/mgit/repos/${repoName}`;
    
    // Check if remote already exists
    const remotes = await git.listRemotes({ fs, dir });
    if (!remotes.find(r => r.remote === 'origin')) {
      await git.addRemote({
        fs,
        dir,
        remote: 'origin',
        url: remoteUrl
      });
      console.log(`🔗 Added remote: ${remoteUrl}`);
    }
    
    // 2. Push with Bearer token in headers
    const pushResult = await git.push({
      fs,
      http,
      dir,
      remote: 'origin',
      ref: 'main',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    console.log(`🚀 Pushed to server:`, pushResult);
  } catch (error) {
    console.error('Failed to push:', error);
    throw new Error(`Failed to push to server: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Read and decrypt a file from the repository
 */
export async function readEncrypted(
  dir: string,
  filepath: string
): Promise<any> {
  try {
    const encrypted = await fs.promises.readFile(`${dir}/${filepath}`, { encoding: 'utf8' });
    const decrypted = await decryptFromStorage(encrypted);
    return decrypted;
  } catch (error) {
    console.error('Failed to read encrypted file:', error);
    throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Clone encrypted repository from server
 */
export async function cloneFromServer(
  repoName: string,
  token: string,
  serverUrl: string = window.location.origin
): Promise<string> {
  const dir = `/${repoName}`;
  const url = `${serverUrl}/api/mgit/repos/${repoName}`;
  
  try {
    await git.clone({
      fs,
      http,
      dir,
      url,
      ref: 'main',
      singleBranch: true,
      depth: 1,
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    console.log(`✅ Cloned repository: ${repoName}`);
    return dir;
  } catch (error) {
    console.error('Failed to clone:', error);
    throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List all files in the repository
 */
export async function listRepoFiles(dir: string): Promise<string[]> {
  try {
    const files = await git.listFiles({
      fs,
      dir,
      ref: 'HEAD'
    });
    
    console.log('📁 Repository files:', files);
    return files;
  } catch (error) {
    console.error('Failed to list files:', error);
    return [];
  }
}

/**
 * List all local repositories in browser storage
 */
export async function listLocalRepos(): Promise<string[]> {
  try {
    const repos: string[] = [];
    const entries = await fs.promises.readdir('/');
    
    for (const entry of entries) {
      try {
        // Check if it's a git repo by looking for .git directory
        const gitDir = `/${entry}/.git`;
        await fs.promises.stat(gitDir);
        repos.push(entry);
      } catch {
        // Not a git repo, skip
      }
    }
    
    return repos;
  } catch (error) {
    console.error('Failed to list repos:', error);
    return [];
  }
}