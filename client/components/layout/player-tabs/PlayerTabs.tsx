import type { ReactNode } from 'react';
import classNames from 'classnames';
import type { Tab } from '../../../domain/navigation';
import style from './PlayerTabs.scss';

/** The pages that need nothing of the window; the local library takes the files that are dropped on the window, the settings are a column of their own */
type Page = Exclude<Tab, 'local' | 'settings'>;

interface PlayerTabsProps {
  tab?: Tab;
  addFiles?: (files: FileList) => void;
  pages: Record<Page, ReactNode>;
  renderLocal: (addFiles: (files: FileList) => void) => ReactNode;
  settings: ReactNode;
  /** What opens over the pages: the details of an album */
  overlay?: ReactNode;
}

const laterPages: Page[] = ['now-playing', 'online-sources', 'favourites', 'playlist', 'equalizer'];

function PlayerTabs({ tab = 'home', addFiles = () => {}, pages, renderLocal, settings, overlay }: PlayerTabsProps) {
  const shown = (name: Tab, content: ReactNode) => (
    <div key={name} className={classNames(style.tab, { [style.active]: tab === name })}>
      {content}
    </div>
  );

  return (
    <div className={style.collection}>
      {shown('home', pages.home)}
      {shown('local', renderLocal(addFiles))}
      {laterPages.map((name) => shown(name, pages[name]))}
      {shown('settings', <div className={style.settings}>{settings}</div>)}
      {overlay}
    </div>
  );
}

export default PlayerTabs;
