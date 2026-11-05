import type { DragEvent } from 'react';
import AlbumSort from '../../library/album-sort';
import type { LibraryView } from '../../../redux/types';
import AlbumView from '../../library/album-view';
import GroupView from '../../library/group-view';
import TrackView from '../../library/track-view';
import style from './LocalCollection.scss';
import FolderManagement from '../../settings/folder-management';
import FolderFilter from '../../library/folder-filter';
import LibrarySearch from '../../library/library-search';
import GroupFilter from '../../library/group-filter';
import GroupSort from '../../library/group-sort';
import RescanButton from '../../library/rescan-button';
import ViewSwitcher from '../../ui/view-switcher/ViewSwitcher';
import type { ViewItem } from '../../ui/view-switcher/ViewSwitcher';
import { useTranslation } from '../../../i18n';

interface LocalCollectionProps {
  view: LibraryView;
  /** An artist, album artist or genre is open, so the page shows its albums */
  groupOpen: boolean;
  setView: (view: LibraryView) => void;
  addFiles: (files: FileList) => void;
}

const LocalCollection = ({ view, setView, groupOpen, addFiles }: LocalCollectionProps) => {
  const { t } = useTranslation();

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    addFiles(event.dataTransfer.files);
  };

  // the lists of names are filtered by their names, in the field of the header
  const groupList = ['artists', 'albumArtists', 'genres'].includes(view) && !groupOpen;

  const views: ViewItem<LibraryView>[] = [
    { view: 'albums', label: t('library.albums'), panel: <AlbumView /> },
    // the lists of names are fetched only while they are shown
    { view: 'artists', label: t('library.artists'), panel: view === 'artists' && <GroupView kind="artist" /> },
    { view: 'albumArtists', label: t('library.albumArtists'), panel: view === 'albumArtists' && <GroupView kind="albumArtist" /> },
    { view: 'genres', label: t('library.genres'), panel: view === 'genres' && <GroupView kind="genre" /> },
    { view: 'tracks', label: t('library.songs'), panel: <TrackView /> },
    {
      view: 'folders',
      label: t('library.folders'),
      panel: (
        <div className={style.folders}>
          <FolderManagement />
        </div>
      ),
    },
  ];

  return (
    <div className={style.localCollection} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <ViewSwitcher
        views={views}
        current={view}
        setView={setView}
        tabs={false}
        controls={
          <div className={style.libraryControls}>
            {view !== 'folders' && (groupList ? <GroupFilter key={view} label={t('groups.filter')} /> : <LibrarySearch key={view} />)}
            <div className={style.filters}>
              {view !== 'folders' && <FolderFilter />}
              {view === 'albums' && <AlbumSort />}
              {groupList && <GroupSort />}
              <RescanButton />
            </div>
          </div>
        }
      />
    </div>
  );
};

export default LocalCollection;
