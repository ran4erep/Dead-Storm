
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Setting base to empty string makes paths relative (assets/file.js instead of /assets/file.js)
  // This allows the app to be deployed to any subdirectory.
  base: '',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1000 // Increase warning limit to 1000kb
  }
});
