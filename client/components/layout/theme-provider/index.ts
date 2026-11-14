import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import { toNowPlaying } from '../../../domain/now-playing';
import ThemeProvider from './ThemeProvider';

const mapState = ({ uiState: { theme, reduceMotion, currentSong, streamTitle, streamArt } }: RootState) => ({
  theme,
  reduceMotion,
  cover: currentSong ? toNowPlaying(currentSong, streamTitle, streamArt).cover : undefined,
});

export default connect(mapState)(ThemeProvider);
