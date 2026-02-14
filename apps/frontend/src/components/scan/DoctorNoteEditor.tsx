// components/scan/DoctorNoteEditor.tsx
// Simple textarea for the doctor to write a clinical note.
// Calls onSubmit with the note text — encryption/push handled by parent.

import { useState } from 'react';

interface DoctorNoteEditorProps {
  onSubmit: (noteText: string) => void;
  onCancel: () => void;
  submitting: boolean;
}

export function DoctorNoteEditor({ onSubmit, onCancel, submitting }: DoctorNoteEditorProps) {
  const [note, setNote] = useState('');

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Add Clinical Note</h2>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Write your clinical observations, diagnosis, and recommendations..."
        className="w-full h-64 p-4 border rounded-lg text-gray-800 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        disabled={submitting}
        autoFocus
      />

      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-gray-400">
          {note.length} character{note.length !== 1 ? 's' : ''}
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(note)}
            disabled={submitting || !note.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Note'}
          </button>
        </div>
      </div>
    </div>
  );
}