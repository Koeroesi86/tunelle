import { useEffect, useState } from 'react';
import type { LoudnessAnalysis, LoudnessProgress } from '@shared/types/loudness';
import { useTranslation } from '../../../i18n';
import { fetchLoudnessAnalysis } from '../../../services/library-api';
import { toHistogramBars } from './histogram-bars';
import style from './LoudnessPanel.scss';

const toDecibels = (ratio: number) => 20 * Math.log10(ratio);

/** The loudness of the track that plays as it was measured: its histogram and its numbers. Nothing for a track that was not measured */
interface LoudnessPanelProps {
  path: string;
  /** The length of the track and how far it is played, in seconds: a bar moves across the histogram with the song when both are known */
  duration?: number;
  currentTime?: number;
  /** How far the measurement is: it changes when a track was measured, which may be the one that plays, so it is asked for again */
  status?: LoudnessProgress;
}

const LoudnessPanel = ({ path, duration, currentTime, status }: LoudnessPanelProps) => {
  const { t, formatNumber } = useTranslation();
  const [found, setFound] = useState<{ path: string; analysis: LoudnessAnalysis } | undefined>(undefined);
  const analysis = found?.path === path ? found.analysis : undefined;

  // a track that is not measured yet is asked for again when the measurement goes on; the analysis of a file does not change, so a found one is kept
  useEffect(() => {
    if (analysis) return undefined;

    let current = true;
    fetchLoudnessAnalysis(path).then((answer) => current && answer && setFound({ path, analysis: answer }));
    return () => {
      current = false;
    };
  }, [path, status, analysis]);

  const histogram = analysis && toHistogramBars(analysis);
  if (!analysis || !histogram) return null;

  const played = duration && currentTime !== undefined ? Math.min(Math.max(currentTime / duration, 0), 1) : undefined;
  const oneDecimal = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const figures = [
    { label: t('loudness.integrated'), value: `${oneDecimal(analysis.integratedLufs)} LUFS` },
    { label: t('loudness.range'), value: `${oneDecimal(analysis.loudnessRange)} LU` },
    { label: t('loudness.peak'), value: `${oneDecimal(toDecibels(analysis.samplePeak))} dBFS` },
  ];

  return (
    <section className={style.panel} aria-label={t('loudness.title')}>
      <div className={style.histogram} role="img" aria-label={t('loudness.histogram', { low: histogram.from, high: histogram.to })}>
        {histogram.bars.map((share, index) => (
          <i key={`bar-${histogram.from + index}`} className={style.bar} style={{ height: `${Math.max(share * 100, 4)}%` }} />
        ))}
        {played !== undefined && <b className={style.position} style={{ left: `${played * 100}%` }} aria-hidden="true" />}
        <b className={style.marker} style={{ left: `${histogram.marker * 100}%` }} />
      </div>
      <div className={style.scale} aria-hidden="true">
        <span>{histogram.from}</span>
        <span>{histogram.to}</span>
      </div>
      <dl className={style.figures}>
        {figures.map(({ label, value }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default LoudnessPanel;
