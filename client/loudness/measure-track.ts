import type { MeasureResult } from '@shared/types/loudness';
import { measureBlocks } from './block-energies';
import { measurementRate } from './k-weighting';
import { measureSliced } from './measure-sliced';
import { summarise } from './summarise';

/** The address of a track of the library, which the main process serves (`/track` of electron/protocols/tunelle-protocol.ts) */
const trackUrl = (path: string) => `tunelle://app/track?path=${encodeURIComponent(path)}`;

/** A file longer than this is not decoded as a whole: the decoded sound of 45 minutes of stereo is 2.2 GB, and 60 minutes took 2.9 GB of the window */
const wholeFileSeconds = 2700;

const decode = (bytes: ArrayBuffer) =>
  // the context only decodes: it opens no audio device, and it sets the rate the file is resampled to
  new OfflineAudioContext(2, 1, measurementRate).decodeAudioData(bytes).then(
    (audio) => audio,
    () => undefined
  );

/** The measurement of a track of the library: the file is fetched, decoded as a whole and measured, or in pieces when it is long */
export const measureTrack = async (id: number, path: string, duration?: number): Promise<MeasureResult> => {
  if ((duration ?? 0) > wholeFileSeconds) return measureSliced(id, trackUrl(path), duration, decode);

  const bytes = await fetch(trackUrl(path)).then(
    (response) => (response.ok ? response.arrayBuffer() : undefined),
    () => undefined
  );
  if (!bytes) return { id, outcome: 'unreadable' };

  const audio = await decode(bytes);
  if (!audio) return { id, outcome: 'undecodable' };

  const summary = summarise([measureBlocks(Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel)))]);
  return summary ? { id, outcome: 'measured', ...summary } : { id, outcome: 'silent' };
};
