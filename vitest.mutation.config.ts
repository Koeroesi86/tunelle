import { defineConfig } from 'vitest/config';
import config from './vitest.config';
import { frontend } from './vitest.frontend';

// Stryker has no choice of a project, so it gets a configuration with the one it needs. See docs/development/mutation-testing.md
// the instrumented code is many times slower, which the reference signals of the loudness tests feel most
export default defineConfig({ ...config, test: { ...config.test, projects: [{ ...frontend, test: { ...frontend.test, testTimeout: 60_000 } }] } });
