import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdvancedEditor } from './AdvancedEditor';

declare global {
  interface Window {
    contentInjected: boolean | undefined;
  }
}

// Android WebView workaround: wait for content injection before rendering
let interval: ReturnType<typeof setInterval>;
interval = setInterval(() => {
  if (!window.contentInjected) return;
  const container = document.getElementById('root');
  const root = createRoot(container!);
  root.render(<AdvancedEditor />);
  clearInterval(interval);
}, 1);