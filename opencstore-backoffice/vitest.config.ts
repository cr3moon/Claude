import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Run in Node environment — tests only cover pure logic, no DOM/Electron
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Resolve the same @ alias as the renderer
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
