import { describe, expect, it } from 'vitest';

import { dedupeCapturedFormsForDisplay } from '../src/services/systemDetailService.js';

describe('systemDetailService captured form dedupe', () => {
  it('collapses duplicate fetch history down to the latest distinct PDF', () => {
    const deduped = dedupeCapturedFormsForDisplay([
      {
        id: 'older-a',
        final_url: 'https://example.org/form-a.pdf',
        requested_url: 'https://example.org/form-a.pdf',
        content_hash: 'hash-a',
        fetched_at: '2026-03-25T10:00:00.000Z',
        effective_decision: 'captured',
        content_available: true,
      },
      {
        id: 'latest-a',
        final_url: 'https://example.org/form-a.pdf',
        requested_url: 'https://example.org/form-a.pdf',
        content_hash: 'hash-a',
        fetched_at: '2026-03-25T12:00:00.000Z',
        effective_decision: 'captured',
        content_available: true,
      },
      {
        id: 'only-b',
        final_url: 'https://example.org/form-b.pdf',
        requested_url: 'https://example.org/form-b.pdf',
        content_hash: 'hash-b',
        fetched_at: '2026-03-25T11:00:00.000Z',
        effective_decision: 'captured',
        content_available: true,
      },
    ]);

    expect(deduped).toHaveLength(2);
    expect(deduped.map((form) => form.id)).toEqual(
      expect.arrayContaining(['latest-a', 'only-b']),
    );
  });

  it('preserves accepted metadata from duplicate rows for the visible representative', () => {
    const [deduped] = dedupeCapturedFormsForDisplay([
      {
        id: 'latest-captured',
        final_url: 'https://example.org/form.pdf',
        requested_url: 'https://example.org/form.pdf',
        content_hash: 'hash-form',
        fetched_at: '2026-03-25T12:00:00.000Z',
        effective_decision: 'captured',
        content_available: false,
        accepted_source_document_id: null,
      },
      {
        id: 'older-accepted',
        final_url: 'https://example.org/form.pdf',
        requested_url: 'https://example.org/form.pdf',
        content_hash: 'hash-form',
        fetched_at: '2026-03-25T11:00:00.000Z',
        effective_decision: 'accepted',
        triage_decision_id: 'triage-1',
        content_available: true,
        accepted_source_document_id: 'source-doc-1',
        accepted_title: 'Canonical Form',
      },
    ]);

    expect(deduped.id).toBe('latest-captured');
    expect(deduped.content_available).toBe(true);
    expect(deduped.effective_decision).toBe('accepted');
    expect(deduped.accepted_source_document_id).toBe('source-doc-1');
    expect(deduped.accepted_title).toBe('Canonical Form');
    expect(deduped.triage_decision_id).toBe('triage-1');
  });
});
