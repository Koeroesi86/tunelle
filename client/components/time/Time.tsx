import { useTranslation } from '../../i18n';

function Time({ seconds }: { seconds?: number | string | null }) {
  const { formatNumber } = useTranslation();
  const total = Math.max(0, Math.floor(parseFloat(`${seconds}`)) || 0);

  return (
    <span>
      {[Math.floor(total / 3600) % 24, Math.floor(total / 60) % 60, total % 60].map((part) => formatNumber(part, { minimumIntegerDigits: 2 })).join(':')}
    </span>
  );
}

export default Time;
