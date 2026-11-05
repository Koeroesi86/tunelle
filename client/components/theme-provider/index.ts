import { connect } from 'react-redux';
import type { RootState } from '../../redux/reducers';
import { toNowPlaying } from '../../utils/now-playing';
import ThemeProvider from './ThemeProvider';

const mapState = ({ uiState: { theme, currentSong, streamTitle, streamArt } }: RootState) => ({
  theme,
  cover: currentSong ? toNowPlaying(currentSong, streamTitle, streamArt).cover : undefined,
});

export default connect(mapState)(ThemeProvider);
