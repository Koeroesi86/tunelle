import { useCallback, useEffect, useState } from 'react';
import type { Loudness, Track } from '@shared/types/library';
import { radioUuidOf } from '../domain/radio-track';
import { fetchTrackFormat } from '../services/library-api';

const toLoudness = ({ trackGain, albumGain, trackPeak, albumPeak }: Loudness): Loudness => ({ trackGain, albumGain, trackPeak, albumPeak });

const isSame = (known: Loudness | undefined, next: Loudness) =>
  known?.trackGain === next.trackGain && known.albumGain === next.albumGain && known.trackPeak === next.trackPeak && known.albumPeak === next.albumPeak;

/**
 * The loudness of the tracks that play and load next, which the lists do not carry; the track is as it was given until it is read or when the library has none.
 * `refresh` changes when the library may have stored something new (the progress of the measurement): the tracks are read again
 */
export const useTrackLoudness = (tracks: (Track | null)[], refresh?: unknown) => {
  const [loudness, setLoudness] = useState<Record<string, Loudness>>({});
  const paths = tracks.flatMap((track) => (track && radioUuidOf(track.path) === undefined ? [track.path] : []));
  const key = paths.join('\n');

  useEffect(() => {
    let current = true;
    // what is known of the tracks that stay is kept while it is read again, so a level does not drop to none between two tracks
    setLoudness((known) => {
      const kept = Object.entries(known).filter(([path]) => paths.includes(path));
      return kept.length === Object.keys(known).length ? known : Object.fromEntries(kept);
    });
    paths.forEach((path) =>
      fetchTrackFormat(path).then((found) => {
        if (current && found) setLoudness((known) => (isSame(known[path], toLoudness(found)) ? known : { ...known, [path]: toLoudness(found) }));
      })
    );
    return () => {
      current = false;
    };
  }, [key, refresh]);

  return useCallback((track: Track | undefined) => (track ? { ...track, ...loudness[track.path] } : undefined), [loudness]);
};
