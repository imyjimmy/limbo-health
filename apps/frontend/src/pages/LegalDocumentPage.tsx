import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  getLegalDocument,
  type LegalDocumentId,
} from '../../../react-native/core/legal/documents';
import {
  parseLegalMarkdown,
  tokenizeLegalInline,
  type LegalMarkdownBlock,
} from '../../../react-native/core/legal/markdown';

const legalPages: Array<{
  id: LegalDocumentId;
  href: string;
  label: string;
}> = [
  {
    id: 'privacy-policy',
    href: '/privacy-policy',
    label: 'Privacy Policy',
  },
  {
    id: 'terms-of-service',
    href: '/terms-of-service',
    label: 'Terms of Service',
  },
];

function renderInline(text: string, keyPrefix: string) {
  return tokenizeLegalInline(text).map((token, tokenIndex) => {
    const key = `${keyPrefix}-${tokenIndex}`;

    if (token.type === 'link') {
      const linkClasses =
        'font-medium text-[#ff9e8b] underline decoration-[rgba(255,158,139,0.45)] underline-offset-4 transition-colors hover:text-[#ffd7cd]';

      if (token.href.startsWith('/')) {
        return (
          <Link key={key} to={token.href} className={linkClasses}>
            {token.text}
          </Link>
        );
      }

      return (
        <a
          key={key}
          href={token.href}
          className={linkClasses}
          rel={token.href.startsWith('http') ? 'noreferrer' : undefined}
          target={token.href.startsWith('http') ? '_blank' : undefined}
        >
          {token.text}
        </a>
      );
    }

    if (token.type === 'code') {
      return (
        <code
          key={key}
          className="rounded-md bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 font-anka text-[0.92em] text-[#ffe7dd]"
        >
          {token.text}
        </code>
      );
    }

    return <Fragment key={key}>{token.text}</Fragment>;
  });
}

function renderBlock(block: LegalMarkdownBlock, blockIndex: number) {
  const blockKey = `legal-block-${blockIndex}`;

  if (block.type === 'heading') {
    if (block.level === 1) {
      return (
        <h1
          key={blockKey}
          className="text-4xl font-semibold tracking-[-0.03em] text-[#fff4ec] sm:text-5xl"
        >
          {block.text}
        </h1>
      );
    }

    if (block.level === 2) {
      return (
        <h2
          key={blockKey}
          className="pt-6 text-2xl font-semibold tracking-[-0.02em] text-[#fff4ec] sm:pt-8"
        >
          {block.text}
        </h2>
      );
    }

    return (
      <h3
        key={blockKey}
        className="pt-3 text-lg font-semibold tracking-[-0.01em] text-[#fff4ec]"
      >
        {block.text}
      </h3>
    );
  }

  if (block.type === 'quote') {
    return (
      <blockquote
        key={blockKey}
        className="rounded-2xl border border-[rgba(255,183,166,0.20)] border-l-[3px] border-l-[#ff8d76] bg-[rgba(255,127,103,0.08)] px-5 py-4 text-sm font-medium leading-7 text-[#ffe7dd]"
      >
        {renderInline(block.text, blockKey)}
      </blockquote>
    );
  }

  if (block.type === 'list') {
    return (
      <ul
        key={blockKey}
        className="space-y-3 pl-5 text-base leading-8 text-[rgba(248,243,238,0.82)] marker:text-[#ff8d76]"
      >
        {block.items.map((item, itemIndex) => (
          <li key={`${blockKey}-item-${itemIndex}`} className="pl-2">
            {renderInline(item, `${blockKey}-item-${itemIndex}`)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p
      key={blockKey}
      className="text-base leading-8 text-[rgba(246,239,231,0.78)] sm:text-[1.03rem]"
    >
      {renderInline(block.text, blockKey)}
    </p>
  );
}

export function LegalDocumentPage({
  documentId,
}: {
  documentId: LegalDocumentId;
}) {
  const appIconSrc = '/medrepo-icon.png';
  const legalDocument = getLegalDocument(documentId);
  const blocks = useMemo(
    () => parseLegalMarkdown(legalDocument.markdown),
    [legalDocument.markdown],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,hsl(220_20%_12%)_0%,hsl(220_20%_8%)_38%,hsl(220_20%_7%)_100%)] text-[#f6efe7]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-24 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(255,127,103,0.11)_0%,_rgba(255,127,103,0)_72%)] blur-3xl" />
      </div>

      <header className="relative border-b border-[rgba(255,255,255,0.08)] bg-[rgba(12,15,21,0.72)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[980px] items-center justify-between px-4 py-4 sm:px-6 lg:px-0">
          <Link to="/" className="flex items-center gap-3">
            <img src={appIconSrc} alt="Limbo Health icon" className="h-10 w-10 rounded-xl" />
            <span className="font-berkeley text-lg tracking-[0.03em] text-[#fff3e9]">
              Limbo<span className="text-[#ff7d66]">Health</span>
            </span>
          </Link>

          <Link
            to="/"
            className="rounded-lg border border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-sm font-medium text-[#ffe0d6] transition-colors hover:bg-[rgba(255,255,255,0.10)]"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <main className="relative px-4 py-12 sm:px-6 sm:py-16 lg:px-0">
        <div className="mx-auto flex w-full max-w-[980px] flex-col gap-8">
          <section className="flex flex-col gap-5">
            <div className="inline-flex w-fit rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-4 py-1.5">
              <span className="font-anka text-xs text-[#ffd9cf] sm:text-sm">Public legal page</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {legalPages.map((page) =>
                page.id === documentId ? (
                  <span
                    key={page.id}
                    className="rounded-full border border-[rgba(255,183,166,0.22)] bg-[rgba(255,127,103,0.10)] px-4 py-2 text-sm font-medium text-[#fff0e8]"
                  >
                    {page.label}
                  </span>
                ) : (
                  <Link
                    key={page.id}
                    to={page.href}
                    className="rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-4 py-2 text-sm font-medium text-[rgba(246,239,231,0.78)] transition-colors hover:bg-[rgba(255,255,255,0.09)] hover:text-[#fff4ec]"
                  >
                    {page.label}
                  </Link>
                ),
              )}
            </div>
          </section>

          <article className="rounded-[28px] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] px-6 py-8 shadow-[0_20px_80px_rgba(0,0,0,0.22)] backdrop-blur-md sm:px-8 sm:py-10">
            <div className="space-y-4">{blocks.map(renderBlock)}</div>
          </article>
        </div>
      </main>
    </div>
  );
}
