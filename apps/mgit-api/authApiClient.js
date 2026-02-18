const AUTH_API_URL = process.env.AUTH_API_URL || 'http://auth-api:3010';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

async function checkAccess({ userId, scanToken, repoId, operation }) {
  const body = { repoId, operation };
  if (userId) body.userId = userId;
  if (scanToken) body.scanToken = scanToken;

  const res = await fetch(`${AUTH_API_URL}/api/auth/check-access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': INTERNAL_SECRET
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`check-access returned ${res.status}`);
  }

  return res.json();
}

async function registerRepo({ repoId, ownerUserId, description, repoType }) {
  const res = await fetch(`${AUTH_API_URL}/api/auth/register-repo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': INTERNAL_SECRET
    },
    body: JSON.stringify({ repoId, ownerUserId, description, repoType })
  });

  if (!res.ok) {
    throw new Error(`register-repo returned ${res.status}`);
  }

  return res.json();
}

async function getUserRepositories(userId) {
  const res = await fetch(`${AUTH_API_URL}/api/auth/user/repositories?userId=${encodeURIComponent(userId)}`, {
    headers: {
      'X-Internal-Secret': INTERNAL_SECRET
    }
  });

  if (!res.ok) {
    throw new Error(`user/repositories returned ${res.status}`);
  }

  return res.json();
}

async function deleteRepoConfig(repoId) {
  const res = await fetch(`${AUTH_API_URL}/api/auth/repos/${encodeURIComponent(repoId)}`, {
    method: 'DELETE',
    headers: {
      'X-Internal-Secret': INTERNAL_SECRET
    }
  });

  if (!res.ok) {
    throw new Error(`delete repo returned ${res.status}`);
  }

  return res.json();
}

async function cleanupStagingRepos() {
  const res = await fetch(`${AUTH_API_URL}/api/auth/scan/cleanup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': INTERNAL_SECRET
    }
  });

  if (!res.ok) {
    throw new Error(`scan/cleanup returned ${res.status}`);
  }

  return res.json();
}

module.exports = {
  checkAccess,
  cleanupStagingRepos,
  registerRepo,
  getUserRepositories,
  deleteRepoConfig
};
