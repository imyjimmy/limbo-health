export interface ParsedFrontMatter {
  hasFrontMatter: boolean;
  attributes: Record<string, string>;
  body: string;
  raw: string | null;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const inner = trimmed.slice(1, -1);
    return inner.replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return trimmed;
}

export function parseMarkdownFrontMatter(markdown: string): ParsedFrontMatter {
  if (!markdown.startsWith('---\n') && !markdown.startsWith('---\r\n')) {
    return {
      hasFrontMatter: false,
      attributes: {},
      body: markdown,
      raw: null,
    };
  }

  const lines = markdown.split('\n');
  if (lines[0].trim() !== '---') {
    return {
      hasFrontMatter: false,
      attributes: {},
      body: markdown,
      raw: null,
    };
  }

  const attributes: Record<string, string> = {};
  let endIndex = -1;

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '---') {
      endIndex = i;
      break;
    }

    const match = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    attributes[match[1]] = unquote(match[2] ?? '');
  }

  if (endIndex === -1) {
    return {
      hasFrontMatter: false,
      attributes: {},
      body: markdown,
      raw: null,
    };
  }

  const raw = lines.slice(0, endIndex + 1).join('\n');
  const body = lines.slice(endIndex + 1).join('\n').replace(/^\s+/, '');

  return {
    hasFrontMatter: true,
    attributes,
    body,
    raw,
  };
}
