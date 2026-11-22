import { useEffect, useState } from 'react';

export type ReadAccent = (url: string) => Promise<string | undefined>;

/** The accent of the cover at the URL while `enabled`, undefined without a cover, while it is read and when it has no colour */
export const useCoverAccent = (cover: string | undefined, enabled: boolean, readAccent: ReadAccent) => {
  const [accent, setAccent] = useState<string | undefined>(undefined);

  useEffect(() => {
    // the previous colour stays until the next cover is read, so the accent does not flash to the default between tracks
    if (!enabled || !cover) {
      setAccent(undefined);
      return undefined;
    }

    let current = true;
    readAccent(cover).then((picked) => current && setAccent(picked));
    return () => {
      current = false;
    };
  }, [cover, enabled]);

  return accent;
};
