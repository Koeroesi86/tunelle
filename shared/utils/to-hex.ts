export const toHex = (values: number[]) => `#${values.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
