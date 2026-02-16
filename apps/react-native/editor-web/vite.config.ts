import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { exec } from 'child_process';

export default defineConfig({
  root: 'editor-web',
  build: {
    outDir: 'build',
    emptyOutDir: false,
  },
  resolve: {
    alias: [
      {
        find: '@10play/tentap-editor',
        replacement: '@10play/tentap-editor/web',
      },
      {
        find: '@tiptap/pm/view',
        replacement: '@10play/tentap-editor/web',
      },
      {
        find: '@tiptap/pm/state',
        replacement: '@10play/tentap-editor/web',
      },
    ],
  },
  plugins: [
    react(),
    viteSingleFile(),
    {
      name: 'postbuild-commands',
      closeBundle: async () => {
        exec('npm run editor:post-build', (error, stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`);
            return;
          }
        });
      },
    },
  ],
});