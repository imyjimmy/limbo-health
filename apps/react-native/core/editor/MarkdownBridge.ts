// core/editor/MarkdownBridge.ts
//
// Custom BridgeExtension that bridges @tiptap/markdown into React Native.
//
// Web side: calls editor.getMarkdown() and editor.commands.setContent(md, { contentType: 'markdown' })
// RN side:  exposes editor.getMarkdown() → Promise<string> and editor.setMarkdown(md: string) → void
//
// This eliminates any HTML↔Markdown conversion layer. The value field stores markdown,
// the editor works in markdown natively via @tiptap/markdown.

import { BridgeExtension } from '@10play/tentap-editor';

// Inline async message helper (not exported from tentap's public API)
class AsyncMessages {
  private subscriptions: { [key: string]: Function[] } = {};

  onMessage(id: string, value: any) {
    this.subscriptions[id]?.forEach((cb) => cb(value));
  }

  sendAsyncMessage<T>(message: any, postMessage: any) {
    const messageId = Math.random().toString(36).substring(7);
    message.payload = message.payload || {};
    message.payload.messageId = messageId;
    return new Promise<T>((resolve) => {
      if (!this.subscriptions[messageId]) {
        this.subscriptions[messageId] = [];
      }
      this.subscriptions[messageId]!.push(resolve);
      postMessage(message);
    });
  }
}

const asyncMessages = new AsyncMessages();

// State that gets synced from web → RN on every editor update
type MarkdownEditorState = {};

// Methods added to the EditorBridge on the RN side
type MarkdownEditorInstance = {
  getMarkdown: () => Promise<string>;
  setMarkdown: (markdown: string) => void;
};

// Augment tentap's module types so TypeScript knows about our additions
declare module '@10play/tentap-editor' {
  interface BridgeState extends MarkdownEditorState {}
  interface EditorBridge extends MarkdownEditorInstance {}
}

// Message types sent from RN → WebView
export enum MarkdownActionType {
  GetMarkdown = 'get-markdown',
  SetMarkdown = 'set-markdown',
  SendMarkdownToNative = 'send-markdown-back',  // NEW: response message
}

type MarkdownMessage =
  | {
      type: MarkdownActionType.GetMarkdown;
      payload: {
        messageId: string;  // CHANGED: was undefined, now carries messageId
      };
    }
  | {
      type: MarkdownActionType.SetMarkdown;
      payload: string;
    }
  | {
      type: MarkdownActionType.SendMarkdownToNative;  // NEW: response type
      payload: {
        content: string;
        messageId: string;
      };
    };

export const MarkdownBridge = new BridgeExtension<
  MarkdownEditorState,
  MarkdownEditorInstance,
  MarkdownMessage
>({
  // No dedicated tiptap extension — @tiptap/markdown is added via tiptapOptions.extensions
  // in AdvancedEditor.tsx. This bridge only handles the RN↔WebView communication.
  forceName: 'markdown',
  onBridgeMessage: (editor, message, sendMessageBack) => {
      if (message.type === MarkdownActionType.GetMarkdown) {
        let markdown = '';
        try {
          markdown = (editor as any).getMarkdown() as string;
        } catch (err) {
          console.error('[MarkdownBridge] getMarkdown() failed:', err);
          // Fall through with empty string so the Promise still resolves
        }
        sendMessageBack({
          type: MarkdownActionType.SendMarkdownToNative,
          payload: {
            content: markdown,
            messageId: message.payload.messageId,
          },
        });
        return true;
        }

        if (message.type === MarkdownActionType.SetMarkdown) {
          editor.commands.setContent(message.payload, {
            contentType: 'markdown',
          } as any);
          return true;
        }

        return false;
      },

  onEditorMessage: (message, _editorBridge) => {
    if (message.type === MarkdownActionType.SendMarkdownToNative) {
      asyncMessages.onMessage(message.payload.messageId, message.payload.content);
      return true;
    }
    return false;
  },

  extendEditorInstance: (sendBridgeMessage) => {
    return {
      getMarkdown: () =>
        asyncMessages.sendAsyncMessage<string>(
          { type: MarkdownActionType.GetMarkdown },
          sendBridgeMessage
        ),
      setMarkdown: (markdown: string) => {
        sendBridgeMessage({
          type: MarkdownActionType.SetMarkdown,
          payload: markdown,
        });
      },
    };
  },

  extendEditorState: () => {
    return {};
  },
});