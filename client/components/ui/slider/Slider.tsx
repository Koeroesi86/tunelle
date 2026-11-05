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
  onInput: FormEventHandler<HTMLInputElement>;
}

const Slider = ({ min = 0, max = 1, step = 0.01, orientation = 'horizontal', value, onInput }: SliderProps) => {
  const slider = useRef<HTMLInputElement>(null);
  const vertical = orientation === 'vertical';
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;

  useEffect(() => {
    if (slider.current) slider.current.value = `${value}`;
  }, [value, min, max]);

  return (
    <div className={classNames(style.slider, { [style.vertical]: vertical })}>
      <input type="range" min={min} max={max} step={step} className={style.range} onInput={onInput} ref={slider} />
      <div className={style.lowerFill} style={vertical ? { height: `${fill}%` } : { width: `${fill}%` }} />
    </div>
  );
};

export default Slider;
