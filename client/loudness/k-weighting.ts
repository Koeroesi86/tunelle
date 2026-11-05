/** The two filters of ITU-R BS.1770 K-weighting at 48 kHz: a high shelf, then a high pass. The measurement runs at 48 kHz, the rate the decoder resamples to */
interface Biquad {
  b: [number, number, number];
  a: [number, number];
}

const kWeightingFilters: Biquad[] = [
  { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] },
  { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] },
];

export const measurementRate = 48000;

/** One direct form II transposed biquad that starts at rest */
const createBiquad = ({ b, a }: Biquad) => {
  let z1 = 0;
  let z2 = 0;
  return (x: number) => {
    const y = b[0] * x + z1;
    z1 = b[1] * x - a[0] * y + z2;
    z2 = b[2] * x - a[1] * y;
    return y;
  };
};

/** The K-weighting of one channel, a sample at a time, so a long file needs no copy of its samples */
export const createKWeighting = () => {
  const [shelf, highPass] = kWeightingFilters.map(createBiquad);
  return (x: number) => highPass(shelf(x));
};
