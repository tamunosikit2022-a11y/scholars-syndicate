import 'dotenv/config';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Test files share one test database, so run them one after another.
    fileParallelism: false,
    globalSetup: ['tests/global-setup.ts'],
    testTimeout: 15_000,
  },
});
