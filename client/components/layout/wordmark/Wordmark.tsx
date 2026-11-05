import { useId } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from '../../../i18n';

interface WordmarkProps {
  /** Sizes the mark by its height, the width follows */
  className?: string;
  /** For a page that has no style sheet, like the splash */
  style?: CSSProperties;
}

const strokeWidth = 4.5;

/** The glyphs of the name, drawn at a baseline of 100 and an x-height top of 60 */
const letters = [
  { x: 0, path: 'M0 20H44M22 20V100' },
  { x: 74, path: 'M0 60V84A16 16 0 0 0 32 84M32 60V100' },
  { x: 136, path: 'M0 100V60M0 76A16 16 0 0 1 32 76V100' },
  { x: 198, path: 'M0 80H40A20 20 0 1 0 34.14 94.14' },
  { x: 328, path: 'M0 80H40A20 20 0 1 0 34.14 94.14' },
];

/** The two l of the name, bars of different height like the ones of the icon */
const bars = [
  { x: 268, top: 2 },
  { x: 298, top: 38 },
];

/** The name of the app: thin letters in the colour of the text, with the two l as bars in the colours of the icon */
const Wordmark = ({ className, style }: WordmarkProps) => {
  const { t } = useTranslation();
  const gradient = useId();

  return (
    <svg className={className} style={style} viewBox="-9 -8 386 124" role="img" aria-label={t('app.name')}>
      <defs>
        <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="100">
          <stop offset="0" stopColor="#ffb347" />
          <stop offset="1" stopColor="#ff5a36" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {letters.map(({ x, path }) => (
          <path key={x} transform={`translate(${x} 0)`} d={path} />
        ))}
      </g>
      {bars.map(({ x, top }) => (
        <line key={x} x1={x} x2={x} y1={top} y2={100} stroke={`url(#${gradient})`} strokeWidth={strokeWidth * 2} strokeLinecap="round" />
      ))}
    </svg>
  );
};

export default Wordmark;
