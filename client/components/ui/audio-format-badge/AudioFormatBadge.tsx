import classNames from 'classnames';
import type { Track } from '@shared/types/library';
import { audioFormatLabel } from '../../../utils/audio-format-label';
import style from './AudioFormatBadge.scss';

/** The format of a track as a small badge, nothing for a track that has none or no track */
const AudioFormatBadge = ({ track, className }: { track?: Track; className?: string }) => {
  const label = track && audioFormatLabel(track);

  return label ? <span className={classNames(style.badge, className)}>{label}</span> : null;
};

export default AudioFormatBadge;
