import { useEffect, useState } from 'react';
import classNames from 'classnames';
import { MdCheck as AddedIcon, MdAddToQueue as QueueIcon, MdQueuePlayNext as PlayNextIcon } from 'react-icons/md';
import type { Track } from '@shared/types/library';
import { useTranslation } from '../../i18n';
import style from './AddToQueue.scss';

interface AddToQueueProps {
  /** The tracks to add, an album or a favourite gives them once they are fetched */
  getTracks: () => Promise<Track[]>;
  add: (tracks: Track[]) => void;
  /** Puts the tracks right after the song that plays instead of at the end of the queue */
  next?: boolean;
  /** Shows the words next to the icon, for a button that stands on its own */
  withLabel?: boolean;
  className?: string;
}

/** How long the button shows that the tracks are in the queue */
const addedFor = 1500;

const words = {
  end: { idle: 'queue.add', done: 'queue.added', short: 'queue.addShort', Icon: QueueIcon },
  next: { idle: 'queue.next', done: 'queue.nextAdded', short: 'queue.nextShort', Icon: PlayNextIcon },
} as const;

/** The button of a track, an album or a favourite that puts its tracks at the end of the queue, or next */
const AddToQueue = ({ getTracks, add, next = false, withLabel = false, className }: AddToQueueProps) => {
  const { t } = useTranslation();
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return undefined;

    const timer = setTimeout(() => setAdded(false), addedFor);
    return () => clearTimeout(timer);
  }, [added]);

  const { idle, done, short, Icon } = next ? words.next : words.end;
  const label = t(added ? done : idle);

  return (
    <button
      type="button"
      className={classNames(style.addToQueue, { [style.withLabel]: withLabel, [style.added]: added }, className)}
      title={label}
      aria-label={label}
      // the button sits in rows that select and play on click
      onClick={(event) => {
        event.stopPropagation();
        getTracks()
          .then((tracks) => {
            add(tracks);
            setAdded(true);
          })
          .catch(console.error);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {added ? <AddedIcon size="16px" /> : <Icon size="16px" />}
      {withLabel && <span>{t(short)}</span>}
    </button>
  );
};

export default AddToQueue;
