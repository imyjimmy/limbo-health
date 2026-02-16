import React from 'react';
import { EditorContent } from '@tiptap/react';
import { useTenTap, TenTapStartKit } from '@10play/tentap-editor';
import { Markdown } from '@tiptap/markdown';
import { MarkdownBridge } from '../core/editor/MarkdownBridge';

export const AdvancedEditor = () => {
  const editor = useTenTap({
    bridges: [...TenTapStartKit, MarkdownBridge],
    tiptapOptions: {
      extensions: [
        Markdown,
      ],
    },
  });

  return (
    <EditorContent
      editor={editor}
      className={window.dynamicHeight ? 'dynamic-height' : undefined}
    />
  );
};