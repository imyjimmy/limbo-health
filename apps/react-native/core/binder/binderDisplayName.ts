export interface ResolveBinderDisplayNameOptions {
  repoId: string;
  remoteName?: string | null;
  cachedName?: string | null;
  localName?: string | null;
}

function normalizeName(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toTitleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function isMeaningfulBinderName(
  candidate: string | null | undefined,
  repoId: string,
): boolean {
  const normalizedCandidate = normalizeName(candidate);
  const normalizedRepoId = normalizeName(repoId);

  if (!normalizedCandidate || !normalizedRepoId) {
    return false;
  }

  return normalizedCandidate.toLowerCase() !== normalizedRepoId.toLowerCase();
}

export function formatBinderFallbackName(repoId: string): string {
  const normalizedRepoId = normalizeName(repoId);
  if (!normalizedRepoId) return 'Medical Binder';

  const timestampSuffix = normalizedRepoId.match(/(\d{4,})$/)?.[1];
  if (timestampSuffix) {
    return `Medical Binder ${timestampSuffix.slice(-4)}`;
  }

  const withoutBinderPrefix = normalizedRepoId.replace(/^binder[-_]?/i, '');
  const humanized = withoutBinderPrefix.replace(/[-_]+/g, ' ').trim();

  if (humanized.length > 0) {
    return toTitleCaseWords(humanized);
  }

  return 'Medical Binder';
}

export function resolveBinderDisplayName({
  repoId,
  remoteName,
  cachedName,
  localName,
}: ResolveBinderDisplayNameOptions): string {
  if (isMeaningfulBinderName(localName, repoId)) {
    return normalizeName(localName)!;
  }

  if (isMeaningfulBinderName(cachedName, repoId)) {
    return normalizeName(cachedName)!;
  }

  if (isMeaningfulBinderName(remoteName, repoId)) {
    return normalizeName(remoteName)!;
  }

  return formatBinderFallbackName(repoId);
}
