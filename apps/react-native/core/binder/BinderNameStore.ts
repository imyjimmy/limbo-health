import * as SecureStore from 'expo-secure-store';

export type BinderNameMap = Record<string, string>;

const BINDER_NAMES_KEY = 'limbo_binder_names_v1';

function sanitizeBinderNameMap(value: unknown): BinderNameMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>).flatMap(([repoId, name]) => {
    if (typeof repoId !== 'string' || typeof name !== 'string') {
      return [];
    }

    const trimmedRepoId = repoId.trim();
    const trimmedName = name.trim();
    if (!trimmedRepoId || !trimmedName) {
      return [];
    }

    return [[trimmedRepoId, trimmedName] as const];
  });

  return Object.fromEntries(entries);
}

export async function readBinderNames(): Promise<BinderNameMap> {
  try {
    const raw = await SecureStore.getItemAsync(BINDER_NAMES_KEY);
    if (!raw) return {};

    return sanitizeBinderNameMap(JSON.parse(raw) as unknown);
  } catch (err) {
    console.warn('Failed to read binder names:', err);
    return {};
  }
}

async function writeBinderNames(nextMap: BinderNameMap): Promise<BinderNameMap> {
  const sanitized = sanitizeBinderNameMap(nextMap);

  try {
    if (Object.keys(sanitized).length === 0) {
      await SecureStore.deleteItemAsync(BINDER_NAMES_KEY);
      return {};
    }

    await SecureStore.setItemAsync(BINDER_NAMES_KEY, JSON.stringify(sanitized));
    return sanitized;
  } catch (err) {
    console.warn('Failed to write binder names:', err);
    return sanitized;
  }
}

export async function rememberBinderName(repoId: string, name: string): Promise<BinderNameMap> {
  const current = await readBinderNames();
  return writeBinderNames({
    ...current,
    [repoId]: name,
  });
}

export async function rememberBinderNames(names: BinderNameMap): Promise<BinderNameMap> {
  const current = await readBinderNames();
  return writeBinderNames({
    ...current,
    ...names,
  });
}

export async function forgetBinderName(repoId: string): Promise<BinderNameMap> {
  const current = await readBinderNames();
  const next = { ...current };
  delete next[repoId];
  return writeBinderNames(next);
}
