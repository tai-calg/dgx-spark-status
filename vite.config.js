import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import {
  assertSecureRemoteConfig,
  getServerHost,
  getServerPort
} from './src/lib/server/security.js';

assertSecureRemoteConfig();

const host = getServerHost();
const port = getServerPort();

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host,
    port,
    strictPort: true,
    hmr: {
      overlay: false
    }
  },
  preview: {
    host,
    port,
    strictPort: true
  },
  optimizeDeps: {
    exclude: ['systeminformation']
  }
});
