import { useState } from 'react';
import classNames from 'classnames';
import { MdClose as RemoveIcon, MdPlayArrow as PlayIcon } from 'react-icons/md';
import type { Track } from '@shared/types/library';
import type { Playlist } from '@shared/types/playlists';
import { playlistEncodings } from '@shared/schemas/playlists';
import { getPlaylistTracks } from '../../../domain/playlists';
import { useDragReorder } from '../../../hooks/use-drag-reorder';
import { useTranslation } from '../../../i18n';
import style from './PlaylistView.scss';
import AudioFormatBadge from '../../ui/audio-format-badge';
import AddToQueue from '../../library/add-to-queue';
import NameField from '../../ui/name-field';
import Confirm from '../../ui/confirm';

interface PlaylistViewProps {
  playlist?: Playlist;
  playTracks: (tracks: Track[]) => void;
  rename: (id: number, name: string) => void;
  remove: (id: number) => void;
  exportPlaylist: (id: number) => void;
  setSync: (id: number, sync: boolean) => void;
  setEncoding: (id: number, encoding?: string) => void;
  undoImport: (id: number) => void;
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

const PlaylistView = ({
  playlist,
  playTracks,
  rename,
  remove,
  exportPlaylist,
  setSync,
  setEncoding,
  undoImport,
  removeEntry,
  moveEntry,
}: PlaylistViewProps) => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [asking, setAsking] = useState(false);
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
        <button type="button" className={style.export} onClick={() => exportPlaylist(playlist.id)}>
          {t('playlists.export')}
        </button>
        {playlist.file && (
          <label className={style.sync} title={t('playlists.keepInSyncNote', { path: playlist.file.path })}>
            <input type="checkbox" checked={playlist.file.sync} onChange={(event) => setSync(playlist.id, event.target.checked)} />
            {t('playlists.keepInSync')}
          </label>
        )}
        {playlist.file && (
          <label className={style.encoding} title={t('playlists.encodingNote')}>
            {t('playlists.encoding')}
            <select value={playlist.file.encodingOverride ?? ''} onChange={(event) => setEncoding(playlist.id, event.target.value || undefined)}>
              <option value="">{t('playlists.encodingAuto', { encoding: playlist.file.encoding ?? '' })}</option>
              {playlistEncodings.map((encoding) => (
                <option key={encoding} value={encoding}>
                  {encoding}
                </option>
              ))}
            </select>
          </label>
        )}
        {playlist.file?.canUndo && (
          <button type="button" className={style.undo} title={t('playlists.undoImportNote')} onClick={() => undoImport(playlist.id)}>
            {t('playlists.undoImport')}
          </button>
        )}
        <button
          type="button"
          className={classNames(style.delete, { [style.danger]: confirming })}
          // a playlist with a file asks in a dialog, which can say that the playlist comes back while the file stays
          onClick={() => (playlist.file ? setAsking(true) : confirming ? remove(playlist.id) : setConfirming(true))}
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
      <Confirm
        message={asking && playlist.file ? t('playlists.deleteFileWarning', { name: playlist.name, file: playlist.file.path.replace(/^.*\//, '') }) : null}
        confirm={() => {
          setAsking(false);
          remove(playlist.id);
        }}
        cancel={() => setAsking(false)}
      />
    </div>
  );
};

export default PlaylistView;
