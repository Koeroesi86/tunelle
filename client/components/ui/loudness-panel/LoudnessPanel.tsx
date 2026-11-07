import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import type { LoudnessAnalysis, LoudnessProgress } from '@shared/types/loudness';
import { useTranslation } from '../../../i18n';
import { fetchLoudnessAnalysis } from '../../../services/library-api';
import { toHistogramBars } from './histogram-bars';
import style from './LoudnessPanel.scss';

const toDecibels = (ratio: number) => 20 * Math.log10(ratio);

/** The loudness of the track that plays as it was measured: its histogram and its numbers. Nothing for a track that was not measured */
interface LoudnessPanelProps {
  /** The file of the track; a station has none, and shows no loudness */
  path?: string;
  /** The length of the track and how far it is played, in seconds: a bar moves across the histogram with the song when both are known */
  duration?: number;
  currentTime?: number;
  /** How far the measurement is: it changes when a track was measured, which may be the one that plays, so it is asked for again */
  status?: LoudnessProgress;
  /** The rate of the file and the rate the audio context outputs at, in Hz: the panel tells whether the sound is resampled in between; nothing when the file's is not known */
  sampleRate?: number;
  outputRate?: number;
}

const LoudnessPanel = ({ path, duration, currentTime, status, sampleRate, outputRate }: LoudnessPanelProps) => {
  const { t, formatNumber } = useTranslation();
  const [found, setFound] = useState<{ path: string; analysis: LoudnessAnalysis } | undefined>(undefined);
  const analysis = path !== undefined && found?.path === path ? found.analysis : undefined;

  // a track that is not measured yet is asked for again when the measurement goes on; the analysis of a file does not change, so a found one is kept
  useEffect(() => {
    if (analysis || !path) return undefined;

    let current = true;
    fetchLoudnessAnalysis(path).then((answer) => current && answer && setFound({ path, analysis: answer }));
    return () => {
      current = false;
    };
  }, [path, status, analysis]);

  const histogram = analysis && toHistogramBars(analysis);
  const lit = useRef<HTMLDivElement>(null);
  const played = duration && currentTime !== undefined ? Math.min(Math.max(currentTime / duration, 0), 1) : undefined;
  // a custom property that the style sheet moves with the same ease as the line, so the lit bars follow it; set in the commit, so the bars are never painted at the start first
  useLayoutEffect(() => lit.current?.style.setProperty('--played', `${(played ?? 0) * 100}%`), [played, histogram !== undefined]);
  const kilohertz = (rate: number) => formatNumber(rate / 1000, { maximumFractionDigits: 1 });
  const isResampled = sampleRate !== undefined && outputRate !== undefined && sampleRate !== outputRate;
  const signal = sampleRate && (
    <div className={classNames(style.signal, { [style.resampled]: isResampled })}>
      <div className={style.signalRate}>
        <span className={style.signalLabel}>{t('loudness.rate')}</span>
        <span
          className={style.signalValue}
          aria-label={isResampled ? t('loudness.resampledFrom', { from: kilohertz(sampleRate), to: kilohertz(outputRate) }) : undefined}
        >
          {kilohertz(sampleRate)}
          {isResampled && ` → ${kilohertz(outputRate)}`} kHz
        </span>
      </div>
      <span className={style.signalState}>{t(isResampled ? 'loudness.resampled' : 'loudness.native')}</span>
    </div>
  );
  const barElements = histogram?.bars.map((share, index) => (
    <i key={`bar-${histogram.from + index}`} className={style.bar} style={{ height: `${Math.max(share * 100, 4)}%` }} />
  ));
  if (!analysis || !histogram) return signal ? <section className={style.panel}>{signal}</section> : null;

  const oneDecimal = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const figures = [
    { label: t('loudness.integrated'), value: oneDecimal(analysis.integratedLufs), unit: 'LUFS' },
    { label: t('loudness.range'), value: oneDecimal(analysis.loudnessRange), unit: 'LU' },
    { label: t('loudness.peak'), value: oneDecimal(toDecibels(analysis.samplePeak)), unit: 'dBFS' },
  ];

  return (
    <section className={style.panel} aria-label={t('loudness.title')}>
      {signal}
      <div className={style.histogram} role="img" aria-label={t('loudness.histogram', { low: histogram.from, high: histogram.to })}>
        <div className={classNames(style.bars, { [style.dimmed]: played !== undefined })}>{barElements}</div>
        {played !== undefined && (
          <div className={classNames(style.bars, style.lit)} ref={lit} aria-hidden="true">
            {barElements}
          </div>
        )}
        {played !== undefined && <b className={style.position} style={{ left: `${played * 100}%` }} aria-hidden="true" />}
        <b className={style.marker} style={{ left: `${histogram.marker * 100}%` }} />
      </div>
      <dl className={style.figures}>
        {figures.map(({ label, value, unit }) => (
          <div key={label}>
            <dt>
              {label}
              <small>{unit}</small>
            </dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default LoudnessPanel;
