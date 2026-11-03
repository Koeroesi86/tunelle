import classNames from 'classnames';
import style from './LiveShimmer.scss';

interface LiveShimmerProps {
  isPlaying: boolean;
}

/** What a station shows in place of the seek bar: it has no position, so a light sweeps along the track while it plays and stays out of sight when it does not */
const LiveShimmer = ({ isPlaying }: LiveShimmerProps) => <div className={classNames(style.shimmer, { [style.playing]: isPlaying })} aria-hidden="true" />;

export default LiveShimmer;
