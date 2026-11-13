import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import classNames from 'classnames';
import { MdPhotoCamera as CoverIcon } from 'react-icons/md';
import type { AlbumCoverCandidates, AlbumCoverFailure } from '@shared/types/album-cover';
import { useTranslation } from '../../../i18n';
import style from './AlbumCoverMenu.scss';

interface AlbumCoverMenuProps {
  /** Why the file that was picked last cannot be used; undefined when nothing failed */
  failure: AlbumCoverFailure | undefined;
  /** What the last search found, undefined until it answers */
  candidates: AlbumCoverCandidates | undefined;
  /** The text a search starts with: the artist and the title of the album */
  initialQuery: string;
  change: (change: 'pick' | 'remove' | 'reset') => void;
  search: (query: string) => void;
  download: (picture: string) => void;
}

const changes = ['pick', 'remove', 'reset'] as const;

/** The button of an open album that changes its cover: pick an image from the computer, take the cover away, get the cover of the tags back, or search MusicBrainz by a text */
const AlbumCoverMenu = ({ failure, candidates, initialQuery, change, search, download }: AlbumCoverMenuProps) => {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  // the text that was searched last, as an answer for another text is not the one that is waited for
  const [searched, setSearched] = useState<string>();
  // an album may have no cover on the Cover Art Archive, its thumbnail does not load and it is left out
  const [missing, setMissing] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpened(false);
    setSearching(false);
  };

  useEffect(() => {
    if (!opened) return undefined;

    // Escape closes the menu only: the page of the album, which also listens, leaves it alone
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      close();
    };
    const onPointer = (event: PointerEvent) => event.target instanceof Node && !root.current?.contains(event.target) && close();
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [opened]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text || waiting) return;

    setSearched(text);
    setMissing([]);
    search(text);
  };

  // the answer takes a while when other lookups are queued before it (the main process spaces them out): the search is waited for, and not asked twice
  const waiting = searched !== undefined && !failure && !(candidates && candidates.query === searched);
  const results = candidates && candidates.query === searched ? candidates.candidates.filter(({ picture }) => !missing.includes(picture)) : undefined;

  return (
    <div ref={root} className={style.albumCoverMenu}>
      <button type="button" className={style.toggle} aria-haspopup="menu" aria-expanded={opened} onClick={() => (opened ? close() : setOpened(true))}>
        <CoverIcon size="14px" aria-hidden />
        {t('albumCover.change')}
      </button>
      {opened && !searching && (
        <div className={style.menu} role="menu">
          {changes.map((item) => (
            <button
              key={item}
              type="button"
              role="menuitem"
              className={style.item}
              onClick={() => {
                close();
                change(item);
              }}
            >
              {t(`albumCover.${item}`)}
            </button>
          ))}
          <button type="button" role="menuitem" className={style.item} onClick={() => setSearching(true)}>
            {t('albumCover.search')}
          </button>
        </div>
      )}
      {opened && searching && (
        <div className={classNames(style.menu, style.searching)}>
          <form className={style.searchForm} onSubmit={submit}>
            <input
              type="search"
              className={style.searchInput}
              value={query}
              aria-label={t('albumCover.searchLabel')}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" className={style.searchButton} disabled={waiting}>
              {t('albumCover.searchButton')}
            </button>
          </form>
          {waiting && (
            <p className={style.waiting} role="status">
              <span className={style.spinner} aria-hidden />
              {t('albumCover.searching')}
            </p>
          )}
          {results?.length === 0 && candidates && <p className={style.empty}>{t('albumCover.noResults')}</p>}
          <ul className={style.results}>
            {results?.map(({ name, picture }) => (
              <li key={picture}>
                <button
                  type="button"
                  className={style.result}
                  onClick={() => {
                    close();
                    download(picture);
                  }}
                >
                  <img className={style.thumbnail} src={picture} alt="" loading="lazy" onError={() => setMissing((previous) => [...previous, picture])} />
                  <span className={style.resultName}>{name}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={style.item} onClick={() => setSearching(false)}>
            {t('albumCover.back')}
          </button>
        </div>
      )}
      {failure && (
        <span className={style.failure} role="alert">
          {t(`albumCover.error.${failure}`)}
        </span>
      )}
    </div>
  );
};

export default AlbumCoverMenu;
