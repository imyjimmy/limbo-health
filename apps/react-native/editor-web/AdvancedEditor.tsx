import React from 'react';
import { EditorContent } from '@tiptap/react';
import { useTenTap, TenTapStartKit } from '@10play/tentap-editor/web';
import { Markdown } from '@tiptap/markdown';
import { MarkdownBridge } from '../core/editor/MarkdownBridge';

export const AdvancedEditor = () => {
  const bridges = [...TenTapStartKit, MarkdownBridge] as NonNullable<
    NonNullable<Parameters<typeof useTenTap>[0]>['bridges']
  >;

  const editor = useTenTap({
    bridges,
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
