import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Las claves con `^` son regex y Vite las evalúa en orden: las rutas del backend Java (:8080) van antes que `/api` (Node).
  server: { port: 5173, proxy: {
    '^/api/auth/(register|login|guest|logout|me|profile)$': 'http://localhost:8080',
    '^/api/auth/avatars/': 'http://localhost:8080',
    '^/api/(changelog|feedback|games|pokemon)$': 'http://localhost:8080',
    '/api': 'http://localhost:3001',
    '/socket.io': { target: 'http://localhost:3001', ws: true },
  } },
  build: { rollupOptions: { output: { manualChunks: {
    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
    'vendor-socket': ['socket.io-client'],
    'vendor-icons': ['lucide-react'],
    'vendor-validation': ['zod'],
    'vendor-shared': ['@pokemon-universe/shared/public'],
  } } } },
});
