import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/browser-pdf-editor/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
