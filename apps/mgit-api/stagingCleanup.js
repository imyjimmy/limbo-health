const fs = require('fs');
const path = require('path');
const authApiClient = require('./authApiClient');

const REPOS_PATH = process.env.REPOS_PATH || '/repos';
const CLEANUP_INTERVAL = parseInt(process.env.STAGING_CLEANUP_INTERVAL_MS || '900000'); // 15 minutes
const STAGING_MAX_AGE_MS = 60 * 20 * 1000; // 20 minutes

function startCleanupJob() {
  console.log(`🧹 Staging cleanup job started (interval: ${CLEANUP_INTERVAL / 1000}s)`);

  setInterval(async () => {
    try {
      // --- Phase 1: Session-based cleanup (expired/revoked in MySQL) ---
      const sessionRepos = new Set();
      try {
        const result = await authApiClient.cleanupStagingRepos();
        for (const id of [...result.expiredRepos, ...result.revokedRepos]) {
          sessionRepos.add(id);
        }
      } catch (err) {
        console.error('🧹 Session cleanup query failed:', err.message);
        // Continue to filesystem fallback
      }

      // --- Phase 2: Filesystem fallback (orphaned scan- dirs older than 1 hour) ---
      const fsRepos = new Set();
      try {
        const entries = fs.readdirSync(REPOS_PATH, { withFileTypes: true });
        const now = Date.now();

        for (const entry of entries) {
          if (!entry.isDirectory() || !entry.name.startsWith('scan-')) continue;

          const repoPath = path.join(REPOS_PATH, entry.name);
          const stat = fs.statSync(repoPath);
          const age = now - stat.birthtimeMs;

          if (age > STAGING_MAX_AGE_MS) {
            fsRepos.add(entry.name);
          }
        }
      } catch (err) {
        console.error('🧹 Filesystem scan failed:', err.message);
      }

      // Merge both sources
      const allRepos = [...new Set([...sessionRepos, ...fsRepos])];

      if (allRepos.length === 0) {
        console.log('🧹 Cleanup ran — nothing to clean');
        return;
      }

      const sessionOnly = [...sessionRepos].filter(id => !fsRepos.has(id));
      const fsOnly = [...fsRepos].filter(id => !sessionRepos.has(id));
      const both = [...sessionRepos].filter(id => fsRepos.has(id));

      console.log(`🧹 Cleaning up ${allRepos.length} staging repos (session: ${sessionOnly.length}, orphaned: ${fsOnly.length}, both: ${both.length})`);

      for (const repoId of allRepos) {
        if (!repoId.startsWith('scan-')) {
          console.error(`⚠️  Skipping cleanup of ${repoId} — missing scan- prefix`);
          continue;
        }

        const repoPath = path.join(REPOS_PATH, repoId);
        if (fs.existsSync(repoPath)) {
          fs.rmSync(repoPath, { recursive: true, force: true });
          console.log(`🗑️  Deleted staging repo directory: ${repoId}`);
        }

        try {
          await authApiClient.deleteRepoConfig(repoId);
          console.log(`🗑️  Deleted auth config for: ${repoId}`);
        } catch (err) {
          console.error(`⚠️  Failed to delete auth config for ${repoId}:`, err.message);
        }
      }

      console.log(`🧹 Cleanup complete: ${allRepos.length} staging repos removed`);
    } catch (err) {
      console.error('🧹 Staging cleanup error:', err.message);
    }
  }, CLEANUP_INTERVAL);
}

module.exports = { startCleanupJob };