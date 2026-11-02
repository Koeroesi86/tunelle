import { useEffect, useRef } from 'react';
import { useAudioListener } from '../../client/hooks/use-audio-listener';
import { getBandValues } from './getBandValues';
import style from './AudioSpectrum.scss';

export interface AudioSpectrumProps {
  width?: number;
  height?: number;
  /** Defaults to the cap color of the theme (--spectrum-cap) */
  capColor?: string;
  capHeight?: number;
  meterWidth?: number;
  meterCount?: number;
  /** Defaults to the meter color of the theme (--spectrum-meter) */
  meterColor?: string;
  gap?: number;
  fps?: number;
  createAnalyser?: () => AnalyserNode | undefined;
  addPlayStatusListener?: (listener: (isPlaying: boolean) => void) => void;
}

/** A color of the theme as it is now, so the bars follow the accent and the mode as soon as they change */
const readThemeColor = (property: string) => getComputedStyle(document.documentElement).getPropertyValue(property).trim();

// @see https://github.com/hu-ke/react-audio-spectrum
const AudioSpectrum = ({
  width = 200,
  height = 150,
  capColor,
  capHeight = 2,
  meterWidth = 2,
  meterCount = 40 * (2 + 2),
  meterColor,
  gap = 10,
  fps = 30,
  createAnalyser = () => undefined,
  addPlayStatusListener = () => {},
}: AudioSpectrumProps) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const canvasContext = useRef<CanvasRenderingContext2D | null>(null);
  const analyser = useRef<AnalyserNode | undefined>(undefined);
  const isPlaying = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const animationId = useRef<number>(undefined);

  const stopAnimation = () => {
    clearTimeout(timer.current);
    window.cancelAnimationFrame(animationId.current ?? 0);
  };

  const drawSpectrum = () => {
    const context = canvasContext.current;
    if (!canvas.current || !context) return;

    // a running loop would keep drawing next to the new one
    stopAnimation();

    const canvasWidth = canvas.current.width;
    const canvasHeight = canvas.current.height - capHeight;
    const caps: number[] = []; // the vertical position of the caps in the previous frame

    const clearCanvas = () => context.clearRect(0, 0, canvasWidth, canvasHeight + capHeight);
    const getY = (value: number) => ((255 - value) * canvasHeight) / 255;
    const drawRect = (i: number, y: number, rectHeight: number) => context.fillRect(i * (meterWidth + gap), y, meterWidth, rectHeight);

    const drawBars = (data: Uint8Array) => {
      const values = getBandValues(data, meterCount);
      const cap = capColor ?? readThemeColor('--spectrum-cap');
      const fill = meterColor ?? readThemeColor('--spectrum-meter');
      clearCanvas();
      for (let i = 0; i < meterCount; i++) {
        const value = values[i];
        if (caps.length < Math.round(meterCount)) caps.push(value);

        context.fillStyle = cap;
        // the cap falls slowly and jumps up with the meter
        caps[i] = value < caps[i] ? caps[i] - 1 : value;
        drawRect(i, getY(caps[i]), capHeight);

        context.fillStyle = fill;
        const y = getY(value) + capHeight;
        drawRect(i, y, canvasHeight - y + capHeight);
      }
    };

    const drawFrame = (node: AnalyserNode) => {
      const data = new Uint8Array(node.frequencyBinCount); // item value of array: 0 - 255
      node.getByteFrequencyData(data);
      if (!isPlaying.current) data.fill(0);
      drawBars(data);
    };

    // once all the caps reached the bottom there is nothing left to draw
    const isSettled = () => !isPlaying.current && !caps.some((cap) => cap > 0);

    const drawMeter = () => {
      if (analyser.current && isSettled()) {
        clearCanvas();
        if (animationId.current) window.cancelAnimationFrame(animationId.current);
        return;
      }
      if (analyser.current) drawFrame(analyser.current);

      timer.current = setTimeout(() => {
        animationId.current = window.requestAnimationFrame(drawMeter);
      }, 1000 / fps);
    };

    animationId.current = window.requestAnimationFrame(drawMeter);
  };

  const connectCanvas = () => {
    canvasContext.current = canvas.current?.getContext('2d') ?? null;
    if (canvas.current) analyser.current = createAnalyser();
  };

  useAudioListener(addPlayStatusListener, (playing) => {
    isPlaying.current = playing;
    // the running loop lets the bars fall and stops itself
    if (!playing) return;

    if (!analyser.current) analyser.current = createAnalyser();
    drawSpectrum();
  });

  useEffect(connectCanvas);
  useEffect(() => stopAnimation, []);

  return <canvas className={style.audioSpectrum} ref={canvas} width={width} height={height} />;
};

export default AudioSpectrum;
