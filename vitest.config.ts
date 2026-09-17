import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));
const prisma = fileURLToPath(new URL('./prisma', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/prisma\//, replacement: `${prisma}/` },
      { find: /^@\//, replacement: `${src}/` },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
