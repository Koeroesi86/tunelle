import { useEffect, useRef } from 'react';
import type { FormEventHandler } from 'react';
import classNames from 'classnames';
import style from './Slider.scss';

interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  orientation?: 'horizontal' | 'vertical';
  value: number;
  /** The accessible name: a range input without one is read as an unnamed slider */
  label: string;
  /** What the value means in words (a time, a gain), where the number alone says too little */
  valueText?: string;
  onInput: FormEventHandler<HTMLInputElement>;
}

const Slider = ({ min = 0, max = 1, step = 0.01, orientation = 'horizontal', value, label, valueText, onInput }: SliderProps) => {
  const slider = useRef<HTMLInputElement>(null);
  const vertical = orientation === 'vertical';
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;

  useEffect(() => {
    if (slider.current) slider.current.value = `${value}`;
  }, [value, min, max]);

  return (
    <div className={classNames(style.slider, { [style.vertical]: vertical })}>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={valueText}
        aria-orientation={orientation}
        min={min}
        max={max}
        step={step}
        className={style.range}
        onInput={onInput}
        ref={slider}
      />
      <div className={style.lowerFill} style={vertical ? { height: `${fill}%` } : { width: `${fill}%` }} />
    </div>
  );
};

export default Slider;
