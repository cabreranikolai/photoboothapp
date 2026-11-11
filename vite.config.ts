import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { randomBytes } from 'node:crypto';
export default defineConfig(({ command }) => {
  const nonce = randomBytes(18).toString('base64');
  return {
    base: './',
    html: command === 'serve' ? { cspNonce: nonce } : undefined,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'development-script-nonce',
        transformIndexHtml(html) {
          return command === 'serve'
            ? html.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`)
            : html;
        },
      },
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      watch: { ignored: ['**/artifacts/**', '**/.npm-cache/**', '**/dist-electron/**'] },
    },
  };
});
