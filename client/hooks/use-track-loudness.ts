import { useCallback, useEffect, useState } from 'react';
import type { Loudness, Track } from '@shared/types/library';
import { radioUuidOf } from '../domain/radio-track';
import { fetchTrackFormat } from '../services/library-api';

const toLoudness = ({ trackGain, albumGain, trackPeak, albumPeak }: Loudness): Loudness => ({ trackGain, albumGain, trackPeak, albumPeak });

/**
 * The loudness of the tracks asked for, which the lists of the library do not carry: it is read for the tracks that play and that load next.
 * The function returns a track with it; until the answer comes, or when the library has none, the track is as it was given
 */
export const useTrackLoudness = (tracks: (Track | null)[]) => {
  const [loudness, setLoudness] = useState<Record<string, Loudness>>({});
  const paths = tracks.flatMap((track) => (track && radioUuidOf(track.path) === undefined ? [track.path] : []));
  const key = paths.join('\n');

  useEffect(() => {
    let current = true;
    // what is known of the tracks that stay is kept while it is read again, so a level does not drop to none between two tracks
    setLoudness((known) => Object.fromEntries(Object.entries(known).filter(([path]) => paths.includes(path))));
    paths.forEach((path) =>
      fetchTrackFormat(path).then((found) => {
        if (current && found) setLoudness((known) => ({ ...known, [path]: toLoudness(found) }));
      })
    );
    return () => {
      current = false;
    };
  }, [key]);

  return useCallback((track: Track | undefined) => (track ? { ...track, ...loudness[track.path] } : undefined), [loudness]);
};
