import { FaChevronLeft } from 'react-icons/fa';
import { useTranslation } from '../../../i18n';
import style from './BackButton.scss';

interface BackButtonProps {
  onClick: () => void;
}

/** The button of a bar that leaves what was opened in a list: an artist, an album or a group */
const BackButton = ({ onClick }: BackButtonProps) => {
  const { t } = useTranslation();

  return (
    <button type="button" className={style.back} onClick={onClick} aria-label={t('groups.back')} title={t('groups.back')}>
      <FaChevronLeft aria-hidden />
    </button>
  );
};

export default BackButton;
