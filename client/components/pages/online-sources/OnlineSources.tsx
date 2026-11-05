import { useTranslation } from '../../../i18n';
import type { OnlineView } from '../../../redux/types';
import RadioStations from '../radio-stations';
import ViewSwitcher from '../../ui/view-switcher/ViewSwitcher';
import type { ViewItem } from '../../ui/view-switcher/ViewSwitcher';

interface OnlineSourcesProps {
  view: OnlineView;
  setView: (view: OnlineView) => void;
}

const OnlineSources = ({ view, setView }: OnlineSourcesProps) => {
  const { t } = useTranslation();
  const views: ViewItem<OnlineView>[] = [{ view: 'radio', label: t('online.radio'), panel: <RadioStations /> }];

  return <ViewSwitcher views={views} current={view} setView={setView} tabs={false} />;
};

export default OnlineSources;
