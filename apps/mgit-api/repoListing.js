function pickFirstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function normalizeTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return new Date().toISOString();
}

function normalizeUserRepositories(repos = []) {
  return repos
    .map((repo) => {
      const repoId = pickFirstNonEmptyString(
        repo?.repoId,
        repo?.repoid,
        repo?.id,
        repo?.name,
      );

      if (!repoId) {
        return null;
      }

      return {
        name: repoId,
        id: repoId,
        description: pickFirstNonEmptyString(repo?.description) || '',
        created: normalizeTimestamp(repo?.createdAt ?? repo?.createdat ?? repo?.created),
        type: pickFirstNonEmptyString(repo?.repoType, repo?.repotype, repo?.type) || 'repository',
        access:
          pickFirstNonEmptyString(repo?.accessLevel, repo?.access_level, repo?.access) ||
          'read-only',
      };
    })
    .filter(Boolean);
}

module.exports = {
  normalizeUserRepositories,
};
