import { describe, expect, it } from 'vitest';
import { findRealWorldTests, readBaseline, usesRealWorld } from './unit-test-isolation';

describe('unit tests', () => {
  it('use no real database, folder, server or process, but the ones that are in the baseline', () => {
    const baseline = readBaseline();

    expect(findRealWorldTests().filter((file) => !baseline.includes(file))).toEqual([]);
  });

  it('are taken off the baseline once they are mocked, so that the baseline only shrinks', () => {
    const found = findRealWorldTests();

    expect(readBaseline().filter((file) => !found.includes(file))).toEqual([]);
  });
});

describe('usesRealWorld', () => {
  it.each(["createTestDatabase from './test-database'", "fs.mkdtempSync(path.join(os.tmpdir(), 'x'))", 'http.createServer()', "execSync('ls')"])(
    'finds %s',
    (text) => {
      expect(usesRealWorld(text)).toBe(true);
    }
  );

  it('does not find a mocked module', () => {
    expect(usesRealWorld("vi.mock('fs/promises'); vi.mock('child_process')")).toBe(false);
  });
});
