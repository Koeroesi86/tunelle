import type { MeasureResult } from '@shared/types/loudness';
import { measureBlocks } from './block-energies';
import { measurementRate } from './k-weighting';
import { summarise } from './summarise';

/** The address of a track of the library, which the main process serves (`/track` of electron/protocols/tunelle-protocol.ts) */
const trackUrl = (path: string) => `tunelle://app/track?path=${encodeURIComponent(path)}`;

const decode = (bytes: ArrayBuffer) =>
  // the context only decodes: it opens no audio device, and it sets the rate the file is resampled to
  new OfflineAudioContext(2, 1, measurementRate).decodeAudioData(bytes).then(
    (audio) => audio,
    () => undefined
  );

/** The measurement of a track of the library: the file is fetched, decoded as a whole and measured */
export const measureTrack = async (id: number, path: string): Promise<MeasureResult> => {
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
