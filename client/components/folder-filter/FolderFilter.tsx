import { useState } from 'react';
import classNames from 'classnames';
import { FaChevronDown, FaRegFolder } from 'react-icons/fa';
import type { Folder } from '@shared/types/library';
import { selectedFolders } from '../../utils/library-query';
import { useTranslation } from '../../i18n';
import { usePopup } from '../../hooks/use-popup';
import style from './FolderFilter.scss';

interface FolderFilterProps {
  /** The folders of the library */
  folders: Folder[];
  /** The folders the collection is limited to, none is all of them; it can hold a folder the library no longer has */
  selected: string[];
  setSelected: (folders: string[]) => void;
}

const FolderFilter = ({ folders, selected, setSelected }: FolderFilterProps) => {
  const { t } = useTranslation();
  // what is checked while the list is open: Clear leaves nothing checked, which shows everything just like all checked do
  const [draft, setDraft] = useState<string[]>();
  const { open, panelId, toggle: toggleOpen, rootProps } = usePopup(() => setDraft(undefined));
  const paths = folders.map(({ path }) => path);
  const known = selectedFolders(selected, folders);
  const checked = draft ?? (known.length ? known : paths);
  const limited = known.length > 0 && known.length < paths.length;
  const label = limited ? t('folderFilter.selected', { count: known.length }) : t('folderFilter.all');

  // every folder checked is no filter
  const choose = (next: string[]) => {
    setDraft(next);
    setSelected(next.length === paths.length ? [] : next);
  };

  const toggle = (path: string) =>
    choose(checked.includes(path) ? checked.filter((item) => item !== path) : paths.filter((item) => item === path || checked.includes(item)));

  return (
    <div className={style.folderFilter} {...rootProps}>
      <button
        type="button"
        className={classNames(style.toggle, { [style.limited]: limited })}
        aria-label={`${t('folderFilter.label')}: ${label}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggleOpen}
      >
        <FaRegFolder aria-hidden />
        {label}
        <FaChevronDown className={style.chevron} aria-hidden />
      </button>
      {open && (
        <div id={panelId} role="group" className={style.panel} aria-label={t('folderFilter.label')}>
          <div className={style.actions}>
            <button type="button" onClick={() => choose(paths)}>
              {t('folderFilter.selectAll')}
            </button>
            <button type="button" onClick={() => choose([])}>
              {t('folderFilter.clear')}
            </button>
          </div>
          <ul className={style.folders}>
            {paths.map((path) => (
              <li key={path}>
                <label title={path}>
                  <input type="checkbox" checked={checked.includes(path)} onChange={() => toggle(path)} />
                  <span>{path}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FolderFilter;
