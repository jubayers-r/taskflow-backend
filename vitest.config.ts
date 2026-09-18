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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/__tests__/**',
        'src/types/**',
        'src/emails/**',
        'src/server.ts',
        'src/workers/**',
      ],
      thresholds: {
        lines: 40,
        functions: 38,
        statements: 40,
        branches: 15,
      },
    },
  },
});
