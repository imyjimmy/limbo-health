const fs = require('fs');
const path = require('path');
const os = require('os');

// SQLite will be conditionally loaded only in Docker environment
let sqlite3;

/**
 * Auth Persistence Layer
 * 
 * Provides dual-backend storage for repository authorization data:
 * - SQLite database when deployed via Docker
 * - JSON file when running in development (non-Docker)
 */
class AuthPersistence {
  constructor() {
    this.isDocker = this.detectDockerEnvironment();
    this.db = null;
    this.configPath = null;
    this.initialized = false;
  }

  /**
   * Detects if we're running in a Docker container
   */
  detectDockerEnvironment() {
    // Method 1: Check for Docker-specific environment variables
    if (process.env.NODE_ENV === 'production' && process.env.REPOS_PATH === '/private_repos') {
      console.log('🐳 Detected Docker environment: NODE_ENV=production, REPOS_PATH=/private_repos');
      return true;
    }
    
    // Method 2: Check for Docker container indicators
    try {
      // Docker containers have /.dockerenv file
      if (fs.existsSync('/.dockerenv')) {
        console.log('🐳 Detected Docker environment: /.dockerenv file exists');
        return true;
      }
      
      // Check cgroup for docker
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
      if (cgroup.includes('docker') || cgroup.includes('containerd')) {
        console.log('🐳 Detected Docker environment: cgroup contains docker/containerd');
        return true;
      }
    } catch (err) {
      // Ignore errors - likely not in Docker or no access to /proc
    }
    
    console.log('💻 Detected local development environment');
    return false;
  }

  /**
   * Initialize the persistence layer
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    if (this.isDocker) {
      await this.initializeSQLite();
    } else {
      this.initializeJSONFile();
    }

    this.initialized = true;
    console.log(`Auth persistence initialized: ${this.isDocker ? 'SQLite (Docker)' : 'JSON (Development)'}`);
    console.log(`Config storage: ${this.isDocker ? '/private_repos/mgit-auth.db' : this.configPath}`);
  }

  /**
   * Initialize SQLite database for Docker environment
   */
  async initializeSQLite() {
    try {
      sqlite3 = require('sqlite3').verbose();
    } catch (err) {
      throw new Error('sqlite3 module not available. Please install: npm install sqlite3');
    }

    // Store database in persistent volume
    const dbPath = process.env.REPOS_PATH ? 
      path.join(process.env.REPOS_PATH, 'mgit-auth.db') : 
      '/private_repos/mgit-auth.db';

    this.db = new sqlite3.Database(dbPath);

    return new Promise((resolve, reject) => {
      // Create tables if they don't exist
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS repositories (
            id TEXT PRIMARY KEY,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            description TEXT,
            repo_type TEXT DEFAULT 'medical-history'
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS repository_access (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repository_id TEXT NOT NULL,
            pubkey TEXT NOT NULL,
            access_level TEXT NOT NULL CHECK (access_level IN ('admin', 'read-write', 'read-only')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (repository_id) REFERENCES repositories (id) ON DELETE CASCADE,
            UNIQUE(repository_id, pubkey)
          )
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_repository_access_repo 
          ON repository_access (repository_id)
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_repository_access_pubkey 
          ON repository_access (pubkey)
        `);

        resolve();
      });
    });
  }

  /**
   * Initialize JSON file storage for development environment
   */
  initializeJSONFile() {
    // Use ~/.mgit/config.json for development
    const mgitDir = path.join(os.homedir(), '.mgit');
    this.configPath = path.join(mgitDir, 'config.json');

    // Ensure the directory exists
    if (!fs.existsSync(mgitDir)) {
      fs.mkdirSync(mgitDir, { recursive: true });
    }

    // Initialize empty config if it doesn't exist
    if (!fs.existsSync(this.configPath)) {
      const initialConfig = {
        repositories: {},
        created_at: new Date().toISOString(),
        version: '1.0'
      };
      fs.writeFileSync(this.configPath, JSON.stringify(initialConfig, null, 2));
    }
  }

  /**
   * Save repository configuration
   */
  async saveRepositoryConfig(repoId, repoConfig) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.isDocker) {
      return this.saveRepositoryConfigSQLite(repoId, repoConfig);
    } else {
      return this.saveRepositoryConfigJSON(repoId, repoConfig);
    }
  }

  /**
   * Save repository config to SQLite
   */
  async saveRepositoryConfigSQLite(repoId, repoConfig) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Begin transaction
        this.db.run('BEGIN TRANSACTION');

        // Insert/update repository
        this.db.run(`
          INSERT OR REPLACE INTO repositories (id, description, repo_type, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `, [repoId, repoConfig.metadata?.description || '', repoConfig.metadata?.type || 'medical-history']);

        // Clear existing access entries for this repo
        this.db.run('DELETE FROM repository_access WHERE repository_id = ?', [repoId]);

        // Insert new access entries
        const stmt = this.db.prepare(`
          INSERT INTO repository_access (repository_id, pubkey, access_level)
          VALUES (?, ?, ?)
        `);

        for (const authEntry of repoConfig.authorized_keys) {
          stmt.run(repoId, authEntry.pubkey, authEntry.access);
        }

        stmt.finalize();

        // Commit transaction
        this.db.run('COMMIT', (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  /**
   * Save repository config to JSON file
   */
  saveRepositoryConfigJSON(repoId, repoConfig) {
    const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    
    config.repositories[repoId] = {
      ...repoConfig,
      updated_at: new Date().toISOString()
    };

    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Load repository configuration
   */
  async loadRepositoryConfig(repoId) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.isDocker) {
      return this.loadRepositoryConfigSQLite(repoId);
    } else {
      return this.loadRepositoryConfigJSON(repoId);
    }
  }

  /**
   * Load repository config from SQLite
   */
  async loadRepositoryConfigSQLite(repoId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM repositories WHERE id = ?',
        [repoId],
        (err, repo) => {
          if (err) {
            reject(err);
            return;
          }

          if (!repo) {
            resolve(null);
            return;
          }

          // Get authorized keys
          this.db.all(
            'SELECT pubkey, access_level FROM repository_access WHERE repository_id = ?',
            [repoId],
            (err, accessRows) => {
              if (err) {
                reject(err);
                return;
              }

              const repoConfig = {
                authorized_keys: accessRows.map(row => ({
                  pubkey: row.pubkey,
                  access: row.access_level
                })),
                metadata: {
                  created: repo.created_at,
                  description: repo.description,
                  type: repo.repo_type
                }
              };

              resolve(repoConfig);
            }
          );
        }
      );
    });
  }

  /**
   * Load repository config from JSON file
   */
  loadRepositoryConfigJSON(repoId) {
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      return config.repositories[repoId] || null;
    } catch (err) {
      console.error('Error loading repository config from JSON:', err);
      return null;
    }
  }

  /**
   * Load all repository configurations
   */
  async loadAllRepositoryConfigs() {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.isDocker) {
      return this.loadAllRepositoryConfigsSQLite();
    } else {
      return this.loadAllRepositoryConfigsJSON();
    }
  }

  /**
   * Load all configs from SQLite
   */
  async loadAllRepositoryConfigsSQLite() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM repositories', [], (err, repos) => {
        if (err) {
          reject(err);
          return;
        }

        const configs = {};
        let pending = repos.length;

        if (pending === 0) {
          resolve(configs);
          return;
        }

        for (const repo of repos) {
          this.db.all(
            'SELECT pubkey, access_level FROM repository_access WHERE repository_id = ?',
            [repo.id],
            (err, accessRows) => {
              if (err) {
                reject(err);
                return;
              }

              configs[repo.id] = {
                authorized_keys: accessRows.map(row => ({
                  pubkey: row.pubkey,
                  access: row.access_level
                })),
                metadata: {
                  created: repo.created_at,
                  description: repo.description,
                  type: repo.repo_type
                }
              };

              pending--;
              if (pending === 0) {
                resolve(configs);
              }
            }
          );
        }
      });
    });
  }

  /**
   * Load all configs from JSON file
   */
  loadAllRepositoryConfigsJSON() {
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      return config.repositories || {};
    } catch (err) {
      console.error('Error loading all repository configs from JSON:', err);
      return {};
    }
  }

  /**
   * Delete repository configuration
   */
  async deleteRepositoryConfig(repoId) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.isDocker) {
      return this.deleteRepositoryConfigSQLite(repoId);
    } else {
      return this.deleteRepositoryConfigJSON(repoId);
    }
  }

  /**
   * Delete repository config from SQLite
   */
  async deleteRepositoryConfigSQLite(repoId) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM repositories WHERE id = ?', [repoId], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Delete repository config from JSON file
   */
  deleteRepositoryConfigJSON(repoId) {
    const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    delete config.repositories[repoId];
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Close database connections
   */
  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          }
          resolve();
        });
      });
    }
  }
}

// Export singleton instance
module.exports = new AuthPersistence();