const fs = require('fs');
const path = require('path');
const authApiClient = require('./authApiClient');

const REPOS_PATH = process.env.REPOS_PATH || '/repos';
const CLEANUP_INTERVAL = parseInt(process.env.STAGING_CLEANUP_INTERVAL_MS || '900000'); // 15 minutes

function startCleanupJob() {
  console.log(`🧹 Staging cleanup job started (interval: ${CLEANUP_INTERVAL / 1000}s)`);

  setInterval(async () => {
    try {
      const result = await authApiClient.cleanupStagingRepos();
      const allRepos = [...new Set([...result.expiredRepos, ...result.revokedRepos])];

      if (allRepos.length === 0) {
        return;
      }

      console.log(`🧹 Cleaning up ${allRepos.length} staging repos:`, allRepos);

      for (const repoId of allRepos) {
        // Safety check: only delete repos with scan- prefix
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
      // Don't crash — cleanup is best-effort
    }
  }, CLEANUP_INTERVAL);
}

module.exports = { startCleanupJob };