import { configDefaults } from 'vitest/config';

/** The tests of the renderer: a project of vitest.config.ts, and the only one of the mutation run (vitest.mutation.config.ts) */
export const frontend = {
  extends: true,
  test: {
    name: 'frontend',
    environment: 'jsdom',
    setupFiles: ['client/test/test-setup-frontend.ts'],
    include: ['client/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, '**/*.timing.test.ts'],
  },
} as const;
