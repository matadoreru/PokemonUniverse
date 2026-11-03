import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/** En desarrollo todo `/api` y el WebSocket de salas `/ws` van al backend Java (:8080), el único servidor desde el corte 2D. */
export function proxyFor(): Record<string, string | ProxyOptions> {
  return {
    '/api': 'http://localhost:8080',
    '/ws': { target: 'ws://localhost:8080', ws: true },
  };
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: proxyFor() },
  build: { rollupOptions: { output: { manualChunks: {
    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
    'vendor-icons': ['lucide-react'],
    'vendor-validation': ['zod'],
    'vendor-shared': ['@pokemon-universe/shared/public'],
  } } } },
});
