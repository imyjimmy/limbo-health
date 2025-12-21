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
    throw new Error(`Failed to create repository: ${error.message}`);
  }
}

/**
 * Commit encrypted medical data to local repository
 */
export async function commitEncrypted(
  dir: string,
  filepath: string,
  data: any,
  message: string,
  author: { name: string; email: string }
): Promise<string> {
  try {
    // 1. Encrypt data with NIP-44
    const encrypted = await encryptForStorage(data);
    
    // 2. Write encrypted content to virtual filesystem
    await fs.promises.writeFile(`${dir}/${filepath}`, encrypted);
    console.log(`📝 Wrote encrypted file: ${filepath}`);
    
    // 3. Stage file
    await git.add({ fs, dir, filepath });
    console.log(`➕ Staged: ${filepath}`);
    
    // 4. Commit
    const sha = await git.commit({
      fs,
      dir,
      message,
      author: {
        name: author.name,
        email: author.email,
        timestamp: Math.floor(Date.now() / 1000)
      }
    });
    
    console.log(`✅ Committed: ${sha}`);
    return sha;
  } catch (error) {
    console.error('Failed to commit:', error);
    throw new Error(`Failed to commit: ${error.message}`);
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
    
    // 2. Push to server with authentication
    const pushResult = await git.push({
      fs,
      http,
      dir,
      remote: 'origin',
      ref: 'main',
      headers: {
        Authorization: `Bearer ${token}` // ← Send JWT as Bearer token
      }
    });
    
    console.log(`🚀 Pushed to server:`, pushResult);
  } catch (error) {
    console.error('Failed to push:', error);
    throw new Error(`Failed to push to server: ${error.message}`);
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
    throw new Error(`Failed to read file: ${error.message}`);
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
      onAuth: () => ({ username: token, password: 'x-oauth-basic' })
    });
    
    console.log(`✅ Cloned repository: ${repoName}`);
    return dir;
  } catch (error) {
    console.error('Failed to clone:', error);
    throw new Error(`Failed to clone repository: ${error.message}`);
  }
}

/**
 * List all local repositories
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