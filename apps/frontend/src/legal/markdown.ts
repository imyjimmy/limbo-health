export type LegalMarkdownBlock =
  | {
      type: 'heading';
      level: 1 | 2 | 3;
      text: string;
    }
  | {
      type: 'paragraph';
      text: string;
    }
  | {
      type: 'quote';
      text: string;
    }
  | {
      type: 'list';
      items: string[];
    };

export type LegalInlineToken =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'code';
      text: string;
    }
  | {
      type: 'link';
      text: string;
      href: string;
    };

const INLINE_TOKEN_PATTERN = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;

function isHeadingLine(line: string): boolean {
  return /^#{1,3}\s+/.test(line);
}

function isQuoteLine(line: string): boolean {
  return /^>\s?/.test(line);
}

function isListLine(line: string): boolean {
  return /^-\s+/.test(line);
}

export function tokenizeLegalInline(text: string): LegalInlineToken[] {
  const tokens: LegalInlineToken[] = [];
  let lastIndex = 0;

  INLINE_TOKEN_PATTERN.lastIndex = 0;

  for (const match of text.matchAll(INLINE_TOKEN_PATTERN)) {
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      tokens.push({
        type: 'text',
        text: text.slice(lastIndex, matchIndex),
      });
    }

    if (match[1] && match[2]) {
      tokens.push({
        type: 'link',
        text: match[1],
        href: match[2],
      });
    } else if (match[3]) {
      tokens.push({
        type: 'code',
        text: match[3],
      });
    }

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      text: text.slice(lastIndex),
    });
  }

  return tokens;
}

export function parseLegalMarkdown(markdown: string): LegalMarkdownBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: LegalMarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index] ?? '';
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    if (isQuoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isQuoteLine((lines[index] ?? '').trimEnd())) {
        quoteLines.push((lines[index] ?? '').trimEnd().replace(/^>\s?/, '').trim());
        index += 1;
      }
      blocks.push({
        type: 'quote',
        text: quoteLines.join(' ').trim(),
      });
      continue;
    }

    if (isListLine(line)) {
      const items: string[] = [];
      while (index < lines.length && isListLine((lines[index] ?? '').trimEnd())) {
        items.push((lines[index] ?? '').trimEnd().replace(/^-\s+/, '').trim());
        index += 1;
      }
      blocks.push({
        type: 'list',
        items,
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const paragraphLine = (lines[index] ?? '').trimEnd();
      if (
        !paragraphLine.trim()
        || isHeadingLine(paragraphLine)
        || isQuoteLine(paragraphLine)
        || isListLine(paragraphLine)
      ) {
        break;
      }
      paragraphLines.push(paragraphLine.trim());
      index += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        text: paragraphLines.join(' ').trim(),
      });
      continue;
    }

    index += 1;
  }

  return blocks;
}
