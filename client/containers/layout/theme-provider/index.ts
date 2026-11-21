import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import { getBackend } from '../../../backend/backend';
import { toNowPlaying } from '../../../domain/now-playing';
import ThemeProvider from '../../../components/layout/theme-provider/ThemeProvider';

const mapState = ({ uiState: { theme, reduceMotion, currentSong, streamTitle, streamArt } }: RootState) => ({
  theme,
  reduceMotion: reduceMotion || getBackend().capabilities.software,
  cover: currentSong ? toNowPlaying(currentSong, streamTitle, streamArt).cover : undefined,
});

export default connect(mapState)(ThemeProvider);
