import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { swapScript } from './mac-update-source';

// the script runs with the real sh and a stand-in for `open`, which starts the "app" by writing the marker like the new version does
describe.skipIf(process.platform === 'win32')('the swap script', () => {
  let folder: string;

  const run = ({ fresh, writesMarker }: { fresh: string; writesMarker: boolean }) => {
    const bin = join(folder, 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'open'),
      `#!/bin/sh\necho "$@" >> "${join(folder, 'opened')}"\n${writesMarker ? `printf '%s' 26.11.2 > "${join(folder, 'marker')}"` : ''}\n`
    );
    chmodSync(join(bin, 'open'), 0o755);

    return spawnSync(
      '/bin/sh',
      [
        '-c',
        swapScript,
        'sh',
        '2147483646',
        join(folder, 'Tunelle.app'),
        fresh,
        join(folder, 'Tunelle.app.backup'),
        join(folder, 'marker'),
        '26.11.2',
        join(folder, 'failed'),
        join(folder, 'staging'),
        'TUNELLE_APP_DATA=/data',
      ],
      { env: { PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' }
    );
  };

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'tunelle-swap-'));
    mkdirSync(join(folder, 'Tunelle.app'));
    writeFileSync(join(folder, 'Tunelle.app', 'version'), 'old');
    mkdirSync(join(folder, 'staging', 'Tunelle.app'), { recursive: true });
    writeFileSync(join(folder, 'staging', 'Tunelle.app', 'version'), 'new');
  });

  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  it('puts the new app in place, opens it with the variables and drops the backup and the staging folder once it started', () => {
    const result = run({ fresh: join(folder, 'staging', 'Tunelle.app'), writesMarker: true });

    expect(result.status).toBe(0);
    expect(readFileSync(join(folder, 'Tunelle.app', 'version'), 'utf8')).toBe('new');
    expect(existsSync(join(folder, 'Tunelle.app.backup'))).toBe(false);
    expect(existsSync(join(folder, 'staging'))).toBe(false);
    expect(readFileSync(join(folder, 'opened'), 'utf8').trim()).toBe(`--env TUNELLE_APP_DATA=/data ${join(folder, 'Tunelle.app')}`);
  });

  it('puts the old app back and records the version when the new one can not be moved in', () => {
    const result = run({ fresh: join(folder, 'missing', 'Tunelle.app'), writesMarker: false });

    expect(result.status).toBe(1);
    expect(readFileSync(join(folder, 'Tunelle.app', 'version'), 'utf8')).toBe('old');
    expect(existsSync(join(folder, 'Tunelle.app.backup'))).toBe(false);
    expect(readFileSync(join(folder, 'failed'), 'utf8').trim()).toBe('26.11.2');
    expect(readFileSync(join(folder, 'opened'), 'utf8')).toContain(join(folder, 'Tunelle.app'));
  });
});
