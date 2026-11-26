/** The names that servers and ffprobe give a codec or a container, by the name the library gives it. See docs/app/decoder-proxy.md */
const aliases: Record<string, string[]> = {
  "MONKEY'S": ['ape'],
  WAVPACK: ['wv', 'wavpack'],
  AIFF: ['aif', 'aiff', 'aifc'],
  DSD: ['dsd', 'dsf', 'dff', 'dsdiff', 'iff'],
  WMA: ['wma', 'asf', 'wmav1', 'wmav2', 'wmapro', 'wmalossless'],
  'WMA-VOICE': ['wmavoice'],
  WAV: ['wav', 'wave', 'w64', 'pcm'],
  'AC-3': ['ac3'],
  ALAW: ['pcm_alaw'],
  MULAW: ['pcm_mulaw'],
  ADPCM: ['adpcm_ms'],
  DVI_ADPCM: ['adpcm_ima_wav'],
  // a container that can hold a decoded codec or another one: only the file tells which
  M4A: ['m4a', 'm4b', 'm4r', 'mp4', 'mov'],
  MATROSKA: ['mka', 'mkv', 'weba', 'webm', 'matroska'],
};

const names = new Map(Object.entries(aliases).flatMap(([name, found]) => found.map((alias) => [alias, name])));

const containers = ['M4A', 'MATROSKA'];

/** The name of a suffix, a container or a codec; of a list of containers (`mov,mp4,m4a`) the first one counts, an unknown name is kept in capitals */
export const toCodecName = (given: string | null | undefined) => {
  const name = given?.split(',')[0].trim().toLowerCase();
  if (!name) return null;
  if (name.startsWith('dsd_')) return 'DSD';
  return names.get(name) ?? (name.startsWith('pcm_') ? 'WAV' : name.toUpperCase());
};

export const isAmbiguousContainer = (codec: string | null) => containers.includes(codec ?? '');

export interface ProbedStream {
  codec: string;
  container: string;
  sampleFormat: string;
  bits: number | null;
}

/** PCM is named by the file it is in, as the library names it */
const toPcmName = ({ container }: ProbedStream) => (['AIFF', 'CAF'].includes(container.toUpperCase()) ? container.toUpperCase() : 'WAV');

/** The codec and the depth of a probed file, as the library names them */
export const toProbedFormat = (stream: ProbedStream) => {
  const { codec, sampleFormat, bits } = stream;
  // ffmpeg gives the DSD of a WavPack file as float samples of 8 bit
  if (codec === 'wavpack' && sampleFormat.startsWith('flt') && bits === 8) return { codec: 'DSD', bitDepth: 1 };
  if (/^pcm_[fsu]\d/.test(codec)) return { codec: /^pcm_f/.test(codec) ? 'IEEE_FLOAT' : toPcmName(stream), bitDepth: bits };
  return { codec: toCodecName(codec), bitDepth: bits };
};
