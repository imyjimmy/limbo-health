import { describe, expect, it } from 'vitest';
import { parseLegalMarkdown, tokenizeLegalInline } from '../core/legal/markdown';

describe('legal markdown helpers', () => {
  it('parses headings, paragraphs, block quotes, and lists into predictable blocks', () => {
    const blocks = parseLegalMarkdown(`# Title

Last updated: April 5, 2026

> Draft only.

Paragraph line one
line two

- first item
- second item
`);

    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Title' },
      { type: 'paragraph', text: 'Last updated: April 5, 2026' },
      { type: 'quote', text: 'Draft only.' },
      { type: 'paragraph', text: 'Paragraph line one line two' },
      { type: 'list', items: ['first item', 'second item'] },
    ]);
  });

  it('tokenizes markdown links and inline code spans for rich text rendering', () => {
    expect(
      tokenizeLegalInline('Read [Terms of Service](/terms-of-service) and use `as is`.'),
    ).toEqual([
      { type: 'text', text: 'Read ' },
      {
        type: 'link',
        text: 'Terms of Service',
        href: '/terms-of-service',
      },
      { type: 'text', text: ' and use ' },
      { type: 'code', text: 'as is' },
      { type: 'text', text: '.' },
    ]);
  });
});
