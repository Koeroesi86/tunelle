import { useTranslation } from '../../i18n';
import Confirm from '../confirm';

interface LauncherOfferProps {
  available: boolean;
  enabled: boolean;
  offered: boolean;
  external: boolean;
  setEnabled: (enabled: boolean) => void;
}

/** Asks once, on the first run from an AppImage, whether to add the app to the application menu; either answer is remembered, and nothing is asked when another tool added it */
const LauncherOffer = ({ available, enabled, offered, external, setEnabled }: LauncherOfferProps) => {
  const { t } = useTranslation();

  return (
    <Confirm
      message={available && !enabled && !offered && !external ? t('launcher.offer') : null}
      confirmLabel={t('launcher.offerAdd')}
      cancelLabel={t('launcher.offerLater')}
      confirm={() => setEnabled(true)}
      cancel={() => setEnabled(false)}
    />
  );
};

export default LauncherOffer;
