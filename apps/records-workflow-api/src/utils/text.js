export function collapseWhitespace(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

export function splitSentences(text) {
  return collapseWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

export function excerptForPattern(text, pattern, radius = 90) {
  const match = pattern.exec(text);
  if (!match || typeof match.index !== 'number') return null;

  const start = Math.max(0, match.index - radius);
  const end = Math.min(text.length, match.index + match[0].length + radius);
  return collapseWhitespace(text.slice(start, end));
}
