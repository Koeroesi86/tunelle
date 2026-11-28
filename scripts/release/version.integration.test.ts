// Needs the real process: what the script prints and its exit code when run by node
import { execFileSync } from 'child_process';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('command line', () => {
  const run = (args: string[], env: Record<string, string>) => {
    const output = execFileSync(process.execPath, [join(__dirname, 'version.js'), ...args], { env, encoding: 'utf8', stdio: 'pipe' });
    return output.trim();
  };

  it('prints the version of a new release from the run number', () => {
    expect(run([], { GITHUB_RUN_NUMBER: '14' })).toMatch(new RegExp(`^\\d{2}\\.[1-9]\\d?\\.14$`));
  });

  it('refuses a run number that is not greater than the latest release', () => {
    expect(() => run(['--after', 'v99.12.1'], { GITHUB_RUN_NUMBER: '14' })).toThrow('is not greater than the latest release v99.12.1');
  });

  it('prints the version when it is greater than the latest release or there is none', () => {
    expect(run(['--after', 'v20.1.1'], { GITHUB_RUN_NUMBER: '14' })).toMatch(/\.14$/);
    expect(run(['--after', ''], { GITHUB_RUN_NUMBER: '14' })).toMatch(/\.14$/);
  });

  it('refuses to print a version without a run number', () => {
    expect(() => run([], {})).toThrow('GITHUB_RUN_NUMBER is not set');
  });
});
