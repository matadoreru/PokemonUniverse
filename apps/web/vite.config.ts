import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001', '/socket.io': { target: 'http://localhost:3001', ws: true } } },
  build: { rollupOptions: { output: { manualChunks: {
    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
    'vendor-socket': ['socket.io-client'],
    'vendor-icons': ['lucide-react'],
    'vendor-validation': ['zod'],
    'vendor-shared': ['@pokemon-universe/shared'],
  } } } },
});
