import type { MeasureResult } from '@shared/types/loudness';
import { measureBlocks } from './block-energies';
import { measurementRate } from './k-weighting';
import { measureSliced } from './measure-sliced';
import { measureWebCodecs } from './measure-webcodecs';
import { readBody } from './read-body';
import { summarise } from './summarise';

/** The address of a track of the library, which the main process serves (`/track` of electron/protocols/tunelle-protocol.ts) */
const trackUrl = (path: string) => `tunelle://app/track?path=${encodeURIComponent(path)}`;

/** A file longer than this is cut into pieces when its format can be cut: the decoded sound of 10 minutes of stereo is 460 MB, of 45 minutes 2.2 GB */
export const slicedFromSeconds = 600;
/** A file of a format that is not cut is still decoded as a whole up to this length; 60 minutes took 2.9 GB of the window */
export const wholeFileSeconds = 2700;

const decode = (bytes: ArrayBuffer) =>
  // the context only decodes: it opens no audio device, and it sets the rate the file is resampled to
  new OfflineAudioContext(2, 1, measurementRate).decodeAudioData(bytes).then(
    (audio) => audio,
    () => undefined
  );

/**
 * The measurement of a track of the library: the file is fetched, decoded as a whole and measured, or in pieces when it is long. `progress` is called
 * whenever a part of the work is done (a chunk read, a piece decoded), which tells the main process that a slow drive is not a stuck one
 */
export const measureTrack = async (id: number, path: string, duration: number | undefined, progress: () => void): Promise<MeasureResult> => {
  const sliced = (duration ?? 0) > slicedFromSeconds ? await measureSliced(id, trackUrl(path), duration, decode, progress) : undefined;
  if (sliced?.outcome === 'too-large' && (duration ?? 0) > wholeFileSeconds) return (await measureWebCodecs(id, trackUrl(path), progress)) ?? sliced;
  if (sliced && sliced.outcome !== 'too-large') return sliced;

  const response = await fetch(trackUrl(path)).then(
    (answer) => (answer.ok ? answer : undefined),
    () => undefined
  );
  const bytes = response && (await readBody(response, progress));
  if (!bytes) return { id, outcome: 'unreadable' };

  const audio = await decode(bytes.buffer);
  progress();
  if (!audio) return { id, outcome: 'undecodable' };

  const summary = summarise([measureBlocks(Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel)))]);
  return summary ? { id, outcome: 'measured', ...summary } : { id, outcome: 'silent' };
};
