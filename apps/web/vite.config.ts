import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Las claves con `^` son regex contra `req.url` (incluye la query) y Vite las evalúa en orden: las rutas del backend Java (:8080) van antes que `/api` (Node).
 * Con `VITE_REALTIME=java` las salas viven en Java, así que sus imágenes y gritos de ronda (`/api/rooms/…`) también.
 */
export function proxyFor(realtime: string | undefined): Record<string, string | ProxyOptions> {
  return {
    '^/api/auth/(register|login|guest|logout|me|profile)(\\?.*)?$': 'http://localhost:8080',
    '^/api/auth/avatars/': 'http://localhost:8080',
    '^/api/(changelog|feedback|games|pokemon)(\\?.*)?$': 'http://localhost:8080',
    ...(realtime === 'java' ? { '^/api/rooms/': 'http://localhost:8080' } : {}),
    '/api': 'http://localhost:3001',
    '/socket.io': { target: 'http://localhost:3001', ws: true },
    '/ws': { target: 'ws://localhost:8080', ws: true },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { port: 5173, proxy: proxyFor(loadEnv(mode, process.cwd(), 'VITE_').VITE_REALTIME) },
  build: { rollupOptions: { output: { manualChunks: {
    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
    'vendor-socket': ['socket.io-client'],
    'vendor-icons': ['lucide-react'],
    'vendor-validation': ['zod'],
    'vendor-shared': ['@pokemon-universe/shared/public'],
  } } } },
}));
