export function normalizeStateCode(value) {
  if (value == null) return null;

  const normalized = String(value).trim().toUpperCase();
  return normalized || null;
}
