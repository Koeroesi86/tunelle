import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import { toNowPlaying } from '../../../domain/now-playing';
import ThemeProvider from '../../../components/layout/theme-provider/ThemeProvider';

const mapState = ({ uiState: { theme, reduceMotion, softwareRendering, currentSong, streamTitle, streamArt } }: RootState) => ({
  theme,
  reduceMotion: reduceMotion || softwareRendering,
  cover: currentSong ? toNowPlaying(currentSong, streamTitle, streamArt).cover : undefined,
});

export default connect(mapState)(ThemeProvider);
