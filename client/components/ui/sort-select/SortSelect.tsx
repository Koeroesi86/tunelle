import { FaArrowDown, FaArrowUp, FaCheck, FaChevronDown, FaSort } from 'react-icons/fa';
import { sortDirections } from '@shared/types/library-query';
import type { Sort, SortDirection } from '@shared/types/library-query';
import { usePopup } from '../../../hooks/use-popup';
import style from './SortSelect.scss';

/** The texts of the control: the word on the chip, the name of its menu and of the directions, the default order and the name of every field and direction */
interface SortLabels<F extends string> {
  prefix: string;
  field: string;
  direction: string;
  default: string;
  fields: Record<F, string>;
  directions: Record<SortDirection, string>;
}

interface SortSelectProps<F extends string> {
  /** The fields to pick from */
  fields: readonly F[];
  labels: SortLabels<F>;
  /** The sort of the list, undefined is the default order */
  sort: Sort<F> | undefined;
  setSort: (sort: Sort<F> | undefined) => void;
}

/** A chip with the field and the direction a list is sorted by, which opens a menu to pick them */
const SortSelect = <F extends string>({ fields, labels, sort, setSort }: SortSelectProps<F>) => {
  const { open, panelId, close, toggle, rootProps } = usePopup();
  const current = sort ? labels.fields[sort.field] : labels.default;

  // a field picked while the order is the default starts ascending, the default order has no field to leave
  const pickField = (field: F | undefined) => {
    setSort(field ? { field, direction: sort?.direction ?? 'asc' } : undefined);
    close();
  };

  const pickDirection = (direction: SortDirection) => sort && setSort({ field: sort.field, direction });

  return (
    <div className={style.sortSelect} {...rootProps}>
      <button type="button" className={style.toggle} aria-haspopup="menu" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <FaSort aria-hidden />
        <span className={style.hint}>{labels.prefix}</span>
        {current}
        {sort?.direction === 'asc' && <FaArrowUp className={style.direction} aria-hidden />}
        {sort?.direction === 'desc' && <FaArrowDown className={style.direction} aria-hidden />}
        <FaChevronDown className={style.chevron} aria-hidden />
      </button>
      {open && (
        <div id={panelId} role="menu" aria-label={labels.field} className={style.panel}>
          {[undefined, ...fields].map((field) => (
            <button
              key={field ?? 'default'}
              type="button"
              role="menuitemradio"
              aria-checked={sort?.field === field}
              className={style.item}
              onClick={() => pickField(field)}
            >
              <span className={style.check}>{sort?.field === field && <FaCheck aria-hidden />}</span>
              {field ? labels.fields[field] : labels.default}
            </button>
          ))}
          <div role="group" aria-label={labels.direction} className={style.directions}>
            {sortDirections.map((direction) => (
              <button
                key={direction}
                type="button"
                role="menuitemradio"
                aria-checked={sort?.direction === direction}
                disabled={!sort}
                onClick={() => pickDirection(direction)}
              >
                {labels.directions[direction]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SortSelect;
