import { useState } from 'react';
import classNames from 'classnames';
import { MdClose as RemoveIcon, MdPlayArrow as PlayIcon } from 'react-icons/md';
import type { Track } from '@shared/types/library';
import type { Playlist } from '@shared/types/playlists';
import { getPlaylistTracks } from '../../client/utils/playlists';
import { useDragReorder } from '../../client/hooks/use-drag-reorder';
import { useTranslation } from '../../client/i18n';
import style from './PlaylistView.scss';
import AudioFormatBadge from '../audio-format-badge';
import AddToQueue from '../add-to-queue';
import NameField from '../name-field';

interface PlaylistViewProps {
  playlist?: Playlist;
  playTracks: (tracks: Track[]) => void;
  rename: (id: number, name: string) => void;
  remove: (id: number) => void;
  removeEntry: (id: number, entryId: number) => void;
  moveEntry: (id: number, entryId: number, toIndex: number) => void;
}

interface TitleProps {
  playlist: Playlist;
  rename: (id: number, name: string) => void;
}

/** The name of the playlist, a click turns it into a field */
const Title = ({ playlist, rename }: TitleProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState<string | undefined>(undefined);

  const submit = () => {
    if (name?.trim() && name.trim() !== playlist.name) rename(playlist.id, name.trim());
    setName(undefined);
  };

  return name === undefined ? (
    <button type="button" className={style.name} title={t('playlists.rename')} onClick={() => setName(playlist.name)}>
      {playlist.name}
    </button>
  ) : (
    <NameField
      autoFocus
      className={style.rename}
      value={name}
      label={t('playlists.rename')}
      onChange={setName}
      onSubmit={submit}
      onCancel={() => setName(undefined)}
      onBlur={submit}
    />
  );
};

const PlaylistView = ({ playlist, playTracks, rename, remove, removeEntry, moveEntry }: PlaylistViewProps) => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const { itemProps, overIndex } = useDragReorder((entryId, toIndex) => playlist && moveEntry(playlist.id, entryId, toIndex));

  if (!playlist) {
    return (
      <div className={style.playlist}>
        <div className={style.contents}>
          <div className={style.message}>{t('playlists.notFound')}</div>
        </div>
      </div>
    );
  }

  const playable = getPlaylistTracks(playlist);
  const hasUnavailable = playlist.entries.some(({ available }) => !available);

  return (
    <div className={style.playlist}>
      <div className={style.header}>
        <Title key={`${playlist.id}/${playlist.name}`} playlist={playlist} rename={rename} />
        <span className={style.count}>{t('playlists.trackCount', { count: playlist.entries.length })}</span>
        <button type="button" className={style.playAll} disabled={playable.length === 0} onClick={() => playTracks(playable)}>
          <PlayIcon size="16px" aria-hidden />
          {t('playlists.playAll')}
        </button>
        {playable.length > 0 && <AddToQueue withLabel className={style.queue} getTracks={() => Promise.resolve(playable)} />}
        {playable.length > 0 && <AddToQueue next withLabel className={style.queue} getTracks={() => Promise.resolve(playable)} />}
        <button
          type="button"
          className={classNames(style.delete, { [style.danger]: confirming })}
          onClick={() => (confirming ? remove(playlist.id) : setConfirming(true))}
          onBlur={() => setConfirming(false)}
        >
          {confirming ? t('playlists.confirmDelete') : t('playlists.delete')}
        </button>
      </div>
      <div className={style.contents}>
        {playlist.entries.length === 0 && <div className={style.message}>{t('playlists.empty')}</div>}
        {hasUnavailable && <div className={style.message}>{t('playlists.unavailableNote')}</div>}
        {playlist.entries.map(({ id, track, available }, index) => (
          <div
            key={id}
            className={classNames(style.entry, { [style.unavailable]: !available, [style.dropTarget]: overIndex === index })}
            onDoubleClick={() => available && playTracks(getPlaylistTracks({ ...playlist, entries: playlist.entries.slice(index) }))}
            {...itemProps(id, index)}
          >
            <span className={style.number}>{index + 1}</span>
            <span className={style.title} title={track.title}>
              {track.title}
            </span>
            <span className={style.details}>{available ? [track.artist, track.album].filter(Boolean).join(' · ') : t('playlists.unavailable')}</span>
            <AudioFormatBadge className={style.format} track={track} />
            <button
              type="button"
              className={style.action}
              disabled={!available}
              aria-label={t('player.play')}
              onClick={() => playTracks(getPlaylistTracks({ ...playlist, entries: playlist.entries.slice(index) }))}
            >
              <PlayIcon size="12px" />
            </button>
            {available && <AddToQueue className={style.action} getTracks={() => Promise.resolve([track])} />}
            {available && <AddToQueue next className={style.action} getTracks={() => Promise.resolve([track])} />}
            <button
              type="button"
              className={style.action}
              title={t('playlists.removeTrack')}
              aria-label={t('playlists.removeTrack')}
              onClick={() => removeEntry(playlist.id, id)}
            >
              <RemoveIcon size="12px" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlaylistView;
