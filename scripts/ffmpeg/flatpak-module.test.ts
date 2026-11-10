import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import source from './ffmpeg-source.json';
import { flatpakModule, modulePath, serialize } from './flatpak-module';

const module = flatpakModule(source);

describe('the Flatpak module of ffmpeg', () => {
  it('is the committed file, so regenerate it with `npm run ffmpeg:flatpak` after a change of ffmpeg-source.json', () => {
    expect(readFileSync(modulePath, 'utf8')).toBe(serialize(module));
  });

  it('builds from the pinned tarball with its sha256, without a network', () => {
    expect(module.sources).toEqual([{ type: 'archive', url: source.url, sha256: source.sha256 }]);
    expect(module['build-commands'][0]).toContain('--disable-network');
  });

  it('configures with exactly the flags of the CI build and none that makes it GPL', () => {
    const configure = module['build-commands'][0];

    source.configure.filter((flag) => !/^--enable-(demuxer|decoder)=/.test(flag)).forEach((flag) => expect(configure).toContain(flag));
    expect(configure).toContain('--enable-demuxer=mov,ape,wv,aiff,iff,dsf,tta,tak,mpc,mpc8 ');
    source.forbidden.forEach((flag) => expect(configure).not.toContain(flag));
  });

  it('installs the license texts under the app id', () => {
    const commands = module['build-commands'].join('\n');

    expect(commands).toContain('${FLATPAK_DEST}/share/licenses/${FLATPAK_ID}/ffmpeg/COPYING.LGPLv2.1');
  });

  it('leaves out the patent-heavy codecs of the Flathub proposal, which the CI build has', () => {
    expect(module['build-commands'][0]).not.toMatch(/wma|asf|ac3|mp2|dca/);
    expect(source.configure.join(' ')).toMatch(/asf.*wmav2/);
  });
});
