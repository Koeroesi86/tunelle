import { useTranslation } from '../../../i18n';
import Confirm from '../../ui/confirm';
import type { RemoteHostState } from '@shared/schemas/remote-host';

interface RemoteRequestProps {
  request: RemoteHostState['pending'][number] | undefined;
  code: string | undefined;
  decide: (deviceId: string, action: 'approve' | 'deny') => void;
}

/** Asks whether the device that waits may listen, whatever page is open; the next one is asked after the answer. The note is the text of the device, shown as text */
const RemoteRequest = ({ request, code, decide }: RemoteRequestProps) => {
  const { t } = useTranslation();
  const message = request && [t('remote.request', { name: request.deviceName, code: code ?? '' }), request.note].filter(Boolean).join('\n');

  return (
    <Confirm
      message={message ?? null}
      confirmLabel={t('remote.approve')}
      cancelLabel={t('remote.deny')}
      confirm={() => request && decide(request.deviceId, 'approve')}
      cancel={() => request && decide(request.deviceId, 'deny')}
    />
  );
};

export default RemoteRequest;
