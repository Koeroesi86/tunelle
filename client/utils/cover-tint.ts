const maxLuminance = 0.28;
const size = 16;

const luminance = (red: number, green: number, blue: number) => (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

/** The color of an image that stands out, darkened so white text stays readable on it; pixels weigh more the more saturated they are */
export const getTint = (pixels: Uint8ClampedArray): string | undefined => {
  const sums = Array.from({ length: pixels.length / 4 }, (_, index) => pixels.slice(index * 4, index * 4 + 4))
    .filter(([, , , alpha]) => alpha > 127)
    .map(([red, green, blue]) => ({ red, green, blue, weight: 1 + Math.max(red, green, blue) - Math.min(red, green, blue) }))
    .reduce(
      (total, pixel) => ({
        red: total.red + pixel.red * pixel.weight,
        green: total.green + pixel.green * pixel.weight,
        blue: total.blue + pixel.blue * pixel.weight,
        weight: total.weight + pixel.weight,
      }),
      { red: 0, green: 0, blue: 0, weight: 0 }
    );

  if (!sums.weight) return undefined;

  const [red, green, blue] = [sums.red, sums.green, sums.blue].map((sum) => sum / sums.weight);
  const scale = Math.min(1, maxLuminance / Math.max(luminance(red, green, blue), 0.01));

  return `rgb(${[red, green, blue].map((channel) => Math.round(channel * scale)).join(', ')})`;
};

/** The tint of a loaded image, undefined when the browser does not let its pixels be read */
export const getImageTint = (image: HTMLImageElement) => {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!context) return undefined;

  context.canvas.width = size;
  context.canvas.height = size;
  context.drawImage(image, 0, 0, size, size);

  try {
    return getTint(context.getImageData(0, 0, size, size).data);
  } catch {
    return undefined;
  }
};
