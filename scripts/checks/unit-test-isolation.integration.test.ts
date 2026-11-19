import { describe, expect, it } from 'vitest';
import { findRealWorldTests, usesRealWorld } from './unit-test-isolation';

describe('unit tests', () => {
  it('use no real database, folder, server or process', () => {
    expect(findRealWorldTests()).toEqual([]);
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
