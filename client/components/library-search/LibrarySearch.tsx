import { useState } from 'react';
import { FaSearch } from 'react-icons/fa';
import { useTranslation } from '../../i18n';
import { useDelayedValue } from '../../hooks/use-delayed-value';
import { useUpdateEffect } from '../../hooks/use-update-effect';
import style from './LibrarySearch.scss';

interface LibrarySearchProps {
  /** The text the library is searched for now */
  search: string;
  setSearch: (search: string) => void;
  /** What the field is called and says before anything is typed, the search of the library when omitted */
  label?: string;
}

/** The same delay as the search of the radio stations */
const searchDelay = 400;

const LibrarySearch = ({ search, setSearch, label }: LibrarySearchProps) => {
  const { t } = useTranslation();
  const name = label ?? t('library.search');
  const [text, setText] = useState(search);
  const delayedText = useDelayedValue(text, searchDelay);

  useUpdateEffect(() => {
    // what the dispatch returns is not a cleanup
    setSearch(delayedText);
  }, [delayedText]);

  return (
    <label className={style.librarySearch}>
      <FaSearch aria-hidden />
      <input type="search" aria-label={name} placeholder={name} value={text} onChange={(event) => setText(event.target.value)} />
    </label>
  );
};

export default LibrarySearch;
