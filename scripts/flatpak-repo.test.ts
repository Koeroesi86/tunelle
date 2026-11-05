import { existsSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { comment, description, findBranch, findKey, refFile, repoFile } from './flatpak-repo';

const { build } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const metainfo = readFileSync(new URL(`../packaging/flatpak/${build.appId}.metainfo.xml`, import.meta.url), 'utf8');

const listing = (validity: string, expires = '') =>
  [
    `sec:${validity}:255:22:ABCDEF0123456789:1700000000:${expires}::u:::scESC:::+:::23::0:`,
    'fpr:::::::::0123456789ABCDEF0123456789ABCDEF01234567:',
    'uid:u::::1700000000::HASH::Tunelle <t@example.com>::::::::::0:',
  ].join('\n');

describe('findKey', () => {
  it('returns the fingerprint of a valid key', () => {
    expect(findKey(listing('u'))).toBe('0123456789ABCDEF0123456789ABCDEF01234567');
  });

  it('accepts a key that expires later', () => {
    expect(findKey(listing('u', '1900000000'), 1800000000000)).toBe('0123456789ABCDEF0123456789ABCDEF01234567');
  });

  it.each([
    ['expired by date', listing('u', '1750000000')],
    ['marked expired', listing('e')],
    ['revoked', listing('r')],
    ['disabled', listing('d')],
  ])('refuses a key that is %s', (reason, text) => {
    expect(() => findKey(text, 1800000000000)).toThrow(/expired, revoked or disabled/);
  });

  it('refuses an import without a secret key', () => {
    expect(() => findKey('')).toThrow(/no secret key/);
  });
});

describe('findBranch', () => {
  const refs = (branch: string) =>
    ['appstream/x86_64', 'appstream2/x86_64', `app/${build.appId}/x86_64/${branch}`, `app/${build.appId}/aarch64/${branch}`].join('\n');

  it('returns the branch both architectures share', () => {
    expect(findBranch(refs('stable'))).toBe('stable');
  });

  it('refuses bundles of different branches', () => {
    expect(() => findBranch(`${refs('stable')}\napp/${build.appId}/x86_64/master`)).toThrow(/one branch/);
  });

  it('refuses a repository without the app', () => {
    expect(() => findBranch('appstream/x86_64')).toThrow(/found: none/);
  });
});

describe('the files of the repository', () => {
  it('points the remote at the repository of the website with the key', () => {
    const text = repoFile('KEY', 'stable');

    expect(text).toMatch(/^\[Flatpak Repo\]$/m);
    expect(text).toMatch(/^Url=https:\/\/koeroesi86\.github\.io\/tunelle\/repo\/$/m);
    expect(text).toMatch(/^GPGKey=KEY$/m);
    expect(text).toMatch(/^DefaultBranch=stable$/m);
  });

  it('names the app and takes the runtime from Flathub', () => {
    const text = refFile('KEY', 'stable');

    expect(text).toContain(`Name=${build.appId}\n`);
    expect(text).toMatch(/^Url=https:\/\/koeroesi86\.github\.io\/tunelle\/repo\/$/m);
    expect(text).toMatch(/^Branch=stable$/m);
    expect(text).toMatch(/^RuntimeRepo=https:\/\/dl\.flathub\.org\/repo\/flathub\.flatpakrepo$/m);
    expect(text).toMatch(/^GPGKey=KEY$/m);
  });

  it('shows the summary, the description and the icon of the app before it is installed', () => {
    [repoFile('KEY', 'stable'), refFile('KEY', 'stable')].forEach((text) => {
      expect(text).toContain(`Comment=${comment}\n`);
      expect(text).toContain(`Description=${description}\n`);
      expect(text).toMatch(/^Icon=https:\/\/koeroesi86\.github\.io\/tunelle\/icon-512\.png$/m);
    });
  });

  it('says what the metainfo of the app says', () => {
    expect(metainfo).toContain(`<summary>${comment}</summary>`);
    expect(metainfo).toContain(`<p>${description}</p>`);
    expect(existsSync(new URL('../site/icon-512.png', import.meta.url))).toBe(true);
  });
});
