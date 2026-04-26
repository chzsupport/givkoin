import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3004,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'motion-vendor': ['framer-motion'],
          'charts-vendor': ['recharts'],
          'icons-vendor': ['lucide-react'],
          'admin-vendor': ['axios', 'clsx', 'tailwind-merge'],
        },
      },
    },
  },
});
