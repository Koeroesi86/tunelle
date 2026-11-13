import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { MdPhotoCamera as PhotoIcon } from 'react-icons/md';
import type { ArtistPhotoCandidates, ArtistPhotoFailure } from '@shared/types/artist-photo';
import { useTranslation } from '../../../i18n';
import style from './ArtistPhotoMenu.scss';

interface ArtistPhotoMenuProps {
  /** Why the file that was picked, or the search, last failed; undefined when nothing failed */
  failure: ArtistPhotoFailure | undefined;
  /** What the last search found, undefined until it answers */
  candidates: ArtistPhotoCandidates | undefined;
  /** The name of the artist, which a search starts with */
  name: string;
  /** Whether the names may be sent to Deezer (the setting of the artist photos), which a search does */
  searchAllowed: boolean;
  change: (change: 'pick' | 'remove' | 'reset') => void;
  search: (query: string) => void;
  download: (picture: string) => void;
}

const changes = ['pick', 'remove', 'reset'] as const;

/** The button of an open artist that changes its photo: pick an image from the computer, show the cover of an album, look the photo up again, or search Deezer by a text */
const ArtistPhotoMenu = ({ failure, candidates, name, searchAllowed, change, search, download }: ArtistPhotoMenuProps) => {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState(name);
  // the text that was searched last, as an answer for another text is not the one that is waited for
  const [searched, setSearched] = useState<string>();
  const root = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpened(false);
    setSearching(false);
  };

  useEffect(() => {
    if (!opened) return undefined;

    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
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
    if (!text) return;

    setSearched(text);
    search(text);
  };

  const results = candidates && candidates.query === searched ? candidates.candidates : undefined;

  return (
    <div ref={root} className={style.artistPhotoMenu}>
      <button type="button" className={style.toggle} aria-haspopup="menu" aria-expanded={opened} onClick={() => (opened ? close() : setOpened(true))}>
        <PhotoIcon size="14px" aria-hidden />
        {t('artistPhoto.change')}
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
              {t(`artistPhoto.${item}`)}
            </button>
          ))}
          {searchAllowed && (
            <button type="button" role="menuitem" className={style.item} onClick={() => setSearching(true)}>
              {t('artistPhoto.search')}
            </button>
          )}
        </div>
      )}
      {opened && searching && (
        <div className={style.menu}>
          <form className={style.searchForm} onSubmit={submit}>
            <input
              type="search"
              className={style.searchInput}
              value={query}
              aria-label={t('artistPhoto.searchLabel')}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
            <button type="submit" className={style.searchButton}>
              {t('artistPhoto.searchButton')}
            </button>
          </form>
          {results?.length === 0 && <p className={style.empty}>{t('artistPhoto.noResults')}</p>}
          <ul className={style.results}>
            {results?.map(({ name: candidate, picture }, index) => (
              <li key={`${picture}-${index}`}>
                <button
                  type="button"
                  className={style.result}
                  onClick={() => {
                    close();
                    download(picture);
                  }}
                >
                  <img className={style.thumbnail} src={picture} alt="" loading="lazy" />
                  <span className={style.resultName}>{candidate}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={style.item} onClick={() => setSearching(false)}>
            {t('artistPhoto.back')}
          </button>
        </div>
      )}
      {failure && (
        <span className={style.failure} role="alert">
          {t(`artistPhoto.error.${failure}`)}
        </span>
      )}
    </div>
  );
};

export default ArtistPhotoMenu;
