// components/scan/MedicalTimeline.tsx
// Renders decrypted medical documents as a chronological timeline.

import { useState, useEffect } from 'react';

interface MedicalDocument {
  value: string;
  metadata: {
    type: string;
    created: string;
    updated?: string;
    provider?: string;
    format?: string;
    encoding?: string;
    condition?: string;
    originalSizeBytes?: number;
    [key: string]: any;
  };
  children: MedicalDocument[];
}

export interface TimelineEntry {
  path: string;
  doc: MedicalDocument;
  imageDataUrl?: string;
}

interface MedicalTimelineProps {
  entries: TimelineEntry[];
  patientName?: string;
  expiresAt: number;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function ExpirationTimer({ expiresAt }: { expiresAt: number }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = expiresAt * 1000 - Date.now();
      if (diff <= 0) {
        setRemaining('Expired');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(`${mins}:${secs.toString().padStart(2, '0')} remaining`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <span className={`text-sm font-mono ${remaining === 'Expired' ? 'text-red-500' : 'text-gray-500'}`}>
      {remaining}
    </span>
  );
}

export function MedicalTimeline({ entries, patientName, expiresAt }: MedicalTimelineProps) {
  const sorted = [...entries]
    .filter((e) => e.doc.metadata?.created)
    .sort((a, b) =>
      new Date(b.doc.metadata.created).getTime() - new Date(a.doc.metadata.created).getTime()
    );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8 pb-4 border-b">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {patientName || 'Patient Records'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {entries.length} record{entries.length !== 1 ? 's' : ''}
          </p>
        </div>
        <ExpirationTimer expiresAt={expiresAt} />
      </div>

      {sorted.length === 0 ? (
        <p className="text-gray-500 text-center py-12">No medical records found.</p>
      ) : (
        <div className="space-y-6">
          {sorted.map((entry) => (
            <div key={entry.path} className="bg-white border rounded-lg p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="inline-block px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                  {entry.doc.metadata.type || 'note'}
                </span>
                <span className="text-sm text-gray-400">
                  {formatDate(entry.doc.metadata.created)}
                </span>
              </div>

              {entry.doc.metadata.condition && (
                <p className="text-xs text-blue-600 mb-2">{entry.doc.metadata.condition}</p>
              )}

              {entry.imageDataUrl && (
                <div className="mb-3">
                  <img
                    src={entry.imageDataUrl}
                    alt={`Medical photo from ${formatDate(entry.doc.metadata.created)}`}
                    className="max-w-full max-h-96 rounded-lg border"
                  />
                </div>
              )}

              {entry.doc.metadata.type !== 'attachment_ref' && entry.doc.value && (
                <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {entry.doc.value}
                </p>
              )}

              <p className="text-xs text-gray-300 mt-3 font-mono">{entry.path}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}