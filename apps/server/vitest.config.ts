import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Creates and migrates the separate `<db>_test` database once per run.
    globalSetup: ['./src/test/global-setup.ts'],
    // Integration tests share one database; run files one after another.
    fileParallelism: false,
    // argon2 hashing is deliberately slow.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
