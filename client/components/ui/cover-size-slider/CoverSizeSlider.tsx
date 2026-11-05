import { FaTh, FaThLarge } from 'react-icons/fa';
import { useTranslation } from '../../../i18n';
import style from './CoverSizeSlider.scss';
import { coverSizes } from '../../../constants/cover-size';

interface CoverSizeSliderProps {
  /** The least width of a cover or tile in px */
  size: number;
  setSize: (size: number) => void;
}

/** The size of the covers: a label, a small and a large grid at the ends of the track and the width */
const CoverSizeSlider = ({ size, setSize }: CoverSizeSliderProps) => {
  const { t } = useTranslation();

  return (
    <label className={style.coverSizeControl} title={t('albums.coverSize')}>
      <span className={style.label}>{t('albums.coverSize')}</span>
      <FaTh className={style.icon} aria-hidden="true" />
      <input
        type="range"
        className={style.slider}
        aria-label={t('albums.coverSize')}
        min={coverSizes.min}
        max={coverSizes.max}
        step={coverSizes.step}
        value={size}
        style={{ backgroundSize: `${((size - coverSizes.min) / (coverSizes.max - coverSizes.min)) * 100}% 4px, 100% 4px` }}
        onChange={(event) => setSize(Number(event.target.value))}
      />
      <FaThLarge className={style.icon} aria-hidden="true" />
      <span className={style.value}>{size} px</span>
    </label>
  );
};

export default CoverSizeSlider;
