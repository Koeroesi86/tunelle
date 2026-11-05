import { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import style from './Equalizer.scss';
import { useTranslation } from '../../../i18n';
import type { MessageKey } from '@shared/locales/translate';
import Slider from '../../ui/slider/Slider';
import EqualizerCurve from './EqualizerCurve';
import { useLatest } from '../../../hooks/use-latest';
import { bandType, defaultGains, equalizerPresets, formatGain, matchingPreset } from '../../../audio/equalizer';
import { equalizerBands, minGain, maxGain } from '../../../constants/equalizer';

// the names of the presets of client/audio/equalizer.ts
const presetNames: Record<string, MessageKey> = {
  flat: 'equalizer.preset.flat',
  bass: 'equalizer.preset.bass',
  vocal: 'equalizer.preset.vocal',
  treble: 'equalizer.preset.treble',
  loudness: 'equalizer.preset.loudness',
};

interface EqualizerProps {
  gains: number[];
  createBiquadFilter: () => BiquadFilterNode;
  connectDestination: (node: AudioNode) => void;
  connectToSource: (node: AudioNode) => void;
  onAudioMounted: (listener: () => void) => void;
  setGain: (index: number, value: number | string) => void;
  setGains: (gains: number[]) => void;
  showFaders: boolean;
  setShowFaders: (show: boolean) => void;
}

const Equalizer = ({
  gains,
  createBiquadFilter,
  connectDestination,
  connectToSource,
  onAudioMounted,
  setGain,
  setGains,
  showFaders,
  setShowFaders,
}: EqualizerProps) => {
  const { t } = useTranslation();
  const filters = useRef<BiquadFilterNode[]>([]);
  const latestGains = useLatest(gains);

  const applyGains = () =>
    filters.current.forEach((filter, index) => {
      filter.gain.value = latestGains.current[index] ?? 0;
    });

  const setup = () => {
    if (filters.current.length > 0) return;

    filters.current = equalizerBands.map(({ frequency }, index) => {
      const filter = createBiquadFilter();
      filter.type = bandType(index);
      filter.frequency.value = frequency;
      return filter;
    });
    filters.current.slice(1).forEach((filter, index) => filters.current[index].connect(filter));

    applyGains();
    connectToSource(filters.current[0]);
    connectDestination(filters.current[filters.current.length - 1]);
  };

  useEffect(() => {
    onAudioMounted(setup);
    // the audio context only adds listeners, so this registers once
  }, []);

  useEffect(applyGains, [gains]);

  const preset = matchingPreset(gains);
  const flat = preset === 'flat';

  return (
    <div className={style.equalizer}>
      <div className={style.content}>
        <div className={style.presets} role="group" aria-label={t('equalizer.presets')}>
          {equalizerPresets.map(({ id, gains: presetGains }) => (
            <button
              type="button"
              key={id}
              className={classNames(style.chip, { [style.active]: id === preset })}
              aria-pressed={id === preset}
              onClick={() => setGains(presetGains)}
            >
              {t(presetNames[id])}
            </button>
          ))}
          {preset === undefined && <span className={classNames(style.chip, style.active, style.custom)}>{t('equalizer.custom')}</span>}
          <button type="button" className={style.reset} disabled={flat} onClick={() => setGains(defaultGains)}>
            {t('equalizer.reset')}
          </button>
          <button type="button" className={style.toggle} aria-expanded={showFaders} onClick={() => setShowFaders(!showFaders)}>
            {t(showFaders ? 'equalizer.hideFaders' : 'equalizer.faders')}
          </button>
        </div>
        <div className={style.card}>
          <div className={style.cardHeader}>
            <b>{t('equalizer.response')}</b>
            {t('equalizer.range')}
            <span className={style.hint}>{t('equalizer.hint')}</span>
          </div>
          <EqualizerCurve gains={gains} setGain={setGain} />
        </div>
        {showFaders && (
          <div className={classNames(style.card, style.faders)}>
            {equalizerBands.map(({ label }, index) => (
              <div className={style.slider} key={label}>
                <div className={classNames(style.value, { [style.changed]: (gains[index] ?? 0) !== 0 })}>{formatGain(gains[index] ?? 0)}</div>
                <div className={style.input}>
                  <Slider
                    min={minGain}
                    max={maxGain}
                    step={0.5}
                    value={gains[index] ?? 0}
                    orientation={'vertical'}
                    onInput={(e) => setGain(index, e.currentTarget.value)}
                  />
                </div>
                <div className={style.band}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Equalizer;
