import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import classNames from 'classnames';
import style from './EqualizerCurve.scss';
import { clampGain, formatGain, frequencyText, gainStep } from '../../../audio/equalizer';
import { equalizerBands, minGain, maxGain } from '../../../constants/equalizer';

interface EqualizerCurveProps {
  gains: number[];
  setGain: (index: number, value: number) => void;
}

// the curve is drawn in this box and stretched over the plot, so only the line is distorted: the dots and the labels are html
const boxWidth = 900;
const boxHeight = 240;
const scale = [12, 6, 0, -6, -12];
const keySteps: Record<string, number> = { ArrowUp: gainStep, ArrowRight: gainStep, ArrowDown: -gainStep, ArrowLeft: -gainStep, PageUp: 3, PageDown: -3 };

const share = (gain: number) => (maxGain - gain) / (maxGain - minGain);
const pointOf = (gain: number, index: number) => [(index / (equalizerBands.length - 1)) * boxWidth, share(gain) * boxHeight] as const;

// a smooth line through the points: each piece is a cubic whose handles follow the neighbours (Catmull-Rom)
const smoothPath = (points: (readonly [number, number])[]) =>
  points
    .map(([x, y], index, all) => {
      if (index === 0) return `M${x},${y}`;
      const [x0, y0] = all[index - 2] ?? all[index - 1];
      const [x1, y1] = all[index - 1];
      const [x3, y3] = all[index + 1] ?? [x, y];
      return `C${x1 + (x - x0) / 6},${y1 + (y - y0) / 6} ${x - (x3 - x1) / 6},${y - (y3 - y1) / 6} ${x},${y}`;
    })
    .join(' ');

const EqualizerCurve = ({ gains, setGain }: EqualizerCurveProps) => {
  const plot = useRef<HTMLDivElement>(null);
  const points = equalizerBands.map((_, index) => pointOf(gains[index] ?? 0, index));
  const line = smoothPath(points);
  const zero = share(0) * boxHeight;

  const gainAt = (clientY: number) => {
    const { top, height } = plot.current?.getBoundingClientRect() ?? { top: 0, height: 0 };
    if (!height) return undefined;
    return clampGain(Math.round((maxGain - ((clientY - top) / height) * (maxGain - minGain)) / gainStep) * gainStep);
  };

  // the move and the release are followed on the window, so a drag goes on when the pointer leaves the dot
  const startDrag = (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.focus();
    const move = (e: PointerEvent) => {
      const gain = gainAt(e.clientY);
      if (gain !== undefined) setGain(index, gain);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    move(event.nativeEvent);
  };

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    const step = keySteps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    setGain(index, clampGain((gains[index] ?? 0) + step));
  };

  return (
    <div className={style.curve}>
      <div className={style.scale} aria-hidden>
        {scale.map((gain) => (
          <span key={gain} style={{ top: `${share(gain) * 100}%` }}>
            {formatGain(gain)}
          </span>
        ))}
      </div>
      <div className={style.plot} ref={plot}>
        <svg className={style.drawing} viewBox={`0 0 ${boxWidth} ${boxHeight}`} preserveAspectRatio="none" aria-hidden>
          {scale.map((gain) => (
            <line key={gain} className={gain === 0 ? style.zero : style.grid} x1={0} x2={boxWidth} y1={share(gain) * boxHeight} y2={share(gain) * boxHeight} />
          ))}
          <path className={style.area} d={`${line} L${boxWidth},${zero} L0,${zero} Z`} />
          <path className={style.line} d={line} />
        </svg>
        {equalizerBands.map(({ label, frequency }, index) => {
          const gain = gains[index] ?? 0;
          return (
            <div
              key={label}
              className={style.dot}
              style={{ left: `${(index / (equalizerBands.length - 1)) * 100}%`, top: `${share(gain) * 100}%` }}
              role="slider"
              tabIndex={0}
              aria-label={frequencyText(frequency)}
              aria-orientation="vertical"
              aria-valuemin={minGain}
              aria-valuemax={maxGain}
              aria-valuenow={gain}
              aria-valuetext={`${formatGain(gain)} dB`}
              onPointerDown={startDrag(index)}
              onKeyDown={onKeyDown(index)}
            />
          );
        })}
      </div>
      <div className={style.values}>
        {equalizerBands.map(({ label }, index) => (
          <span
            key={label}
            className={classNames({ [style.changed]: (gains[index] ?? 0) !== 0 })}
            style={{ left: `${(index / (equalizerBands.length - 1)) * 100}%` }}
          >
            <b>{formatGain(gains[index] ?? 0)}</b>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default EqualizerCurve;
