import path from 'path';

const supportedFormats = [
  'ape',
  'aif',
  'aiff',
  'aifc',
  'asf',
  'wma',
  'wmv',
  'flac',
  'm4a',
  'm4b',
  'm4p',
  'm4v',
  'm4r',
  '3gp',
  'mp4',
  'aac',
  'mp2',
  'mp3',
  'm2a',
  'ogv',
  'oga',
  'ogx',
  'ogg',
  'opus',
  'wav',
  'wv',
  'wvp',
];

const isSupported = (filePath: string) => supportedFormats.includes(path.extname(filePath).replace('.', ''));

export default isSupported;
