import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// globals are off, so Testing Library does not unmount what a test rendered on its own
afterEach(cleanup);
