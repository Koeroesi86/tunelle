import { Fragment } from 'react';
import type { DragEvent, ReactNode } from 'react';
import type { LibraryView } from '../../../domain/navigation';
import style from './LocalCollection.scss';
import ViewSwitcher from '../../ui/view-switcher/ViewSwitcher';
import type { ViewItem } from '../../ui/view-switcher/ViewSwitcher';
import { useTranslation } from '../../../i18n';

/** The controls of the header, which are connected to the store */
export interface LocalCollectionControls {
  search: ReactNode;
  groupFilter: (label: string) => ReactNode;
  folderFilter: ReactNode;
  albumSort: ReactNode;
  groupSort: ReactNode;
  rescan: ReactNode;
}

interface LocalCollectionProps {
  view: LibraryView;
  /** An artist, album artist or genre is open, so the page shows its albums */
  groupOpen: boolean;
  setView: (view: LibraryView) => void;
  addFiles: (files: FileList) => void;
  /** The list of each view; the lists of names are fetched only while they are shown, so only the one of the view is rendered */
  panels: Record<LibraryView, ReactNode>;
  controls: LocalCollectionControls;
}

const LocalCollection = ({ view, setView, groupOpen, addFiles, panels, controls }: LocalCollectionProps) => {
  const { t } = useTranslation();

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    addFiles(event.dataTransfer.files);
  };

  // the lists of names are filtered by their names, in the field of the header
  const groupList = ['artists', 'albumArtists', 'genres'].includes(view) && !groupOpen;

  const views: ViewItem<LibraryView>[] = [
    { view: 'albums', label: t('library.albums'), panel: panels.albums },
    // the lists of names are fetched only while they are shown
    { view: 'artists', label: t('library.artists'), panel: view === 'artists' && panels.artists },
    { view: 'albumArtists', label: t('library.albumArtists'), panel: view === 'albumArtists' && panels.albumArtists },
    { view: 'genres', label: t('library.genres'), panel: view === 'genres' && panels.genres },
    { view: 'tracks', label: t('library.songs'), panel: panels.tracks },
    {
      view: 'folders',
      label: t('library.folders'),
      panel: <div className={style.folders}>{panels.folders}</div>,
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
            {view !== 'folders' && <Fragment key={view}>{groupList ? controls.groupFilter(t('groups.filter')) : controls.search}</Fragment>}
            <div className={style.filters}>
              {view !== 'folders' && controls.folderFilter}
              {view === 'albums' && controls.albumSort}
              {groupList && controls.groupSort}
              {controls.rescan}
            </div>
          </div>
        }
      />
    </div>
  );
};

export default LocalCollection;
