import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { wavHeader } from '../../electron/protocols/wav-header';
import { noiseFixtures, noiseFrames, noisePcm, type NoiseFixture } from './noise-fixtures';

// Needs the ffmpeg and the wavpack of the system: the ffmpeg of the app only encodes PCM. See e2e/fixtures/README.md
const folder = process.argv[2] ?? join(__dirname, '..', '..', 'e2e', 'fixtures', 'noise');
const temp = mkdtempSync(join(tmpdir(), 'tunelle-noise-'));
const source = join(temp, 'source.wav');

const write = ({ file, tool, args, channels, bits, sampleRate }: NoiseFixture) => {
  const layout = { channels, sampleRate, bytesPerSample: bits / 8, frames: noiseFrames };
  writeFileSync(source, Buffer.concat([wavHeader(layout), noisePcm({ channels, bits, sampleRate })]));
  const target = join(folder, file);
  const command = {
    ffmpeg: ['-nostdin', '-v', 'error', '-i', source, '-map_metadata', '-1', '-fflags', '+bitexact', ...args, '-y', target],
    wavpack: [...args, '-y', source, '-o', target],
  };
  execFileSync(tool, command[tool]);
};

noiseFixtures.forEach(write);
rmSync(temp, { recursive: true, force: true });
