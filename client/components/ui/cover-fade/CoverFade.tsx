import { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import style from './CoverFade.scss';

interface CoverFadeProps {
  /** The url of the cover, nothing shows the placeholder of the class */
  src?: string;
  className?: string;
}

interface Shown {
  current?: string;
  /** The cover that was shown before, it stays underneath until the new one has faded in */
  previous?: string;
  /** False for the cover the page opens with, it only fades in when it replaces another */
  changed: boolean;
}

const layerStyle = (src: string) => ({ backgroundImage: `url("${src}")` });

/** A cover that fades into the next one once that has loaded, so a song change neither flashes nor jumps */
const CoverFade = ({ src, className }: CoverFadeProps) => {
  const [shown, setShown] = useState<Shown>({ current: src, changed: false });
  const root = useRef<HTMLSpanElement>(null);

  // the old cover goes once the new one has faded in
  useEffect(() => {
    const element = root.current;
    const done = () => setShown(({ current }) => ({ current, changed: true }));
    element?.addEventListener('animationend', done);

    return () => element?.removeEventListener('animationend', done);
  }, []);

  useEffect(() => {
    if (src === shown.current) return undefined;
    if (!src) {
      setShown({ current: undefined, changed: true });
      return undefined;
    }

    let cancelled = false;
    const image = new Image();
    // a cover that fails to load is shown as the placeholder of the class, as it was before
    const show = () => !cancelled && setShown(({ current }) => ({ current: src, previous: current, changed: true }));
    image.onload = show;
    image.onerror = show;
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src, shown.current]);

  return (
    <span ref={root} className={classNames(style.cover, className)}>
      {shown.previous && <span className={style.layer} style={layerStyle(shown.previous)} />}
      {shown.current && <span key={shown.current} className={classNames(style.layer, { [style.fadeIn]: shown.changed })} style={layerStyle(shown.current)} />}
    </span>
  );
};

export default CoverFade;
