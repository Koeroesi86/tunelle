import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import { toNowPlaying } from '../../../domain/now-playing';
import { localUrl } from '../../../services/local-url';
import { coverAccent } from '../../../services/cover-accent';
import ThemeProvider from '../../../components/layout/theme-provider/ThemeProvider';

const resolved = (cover: string | undefined) => cover && localUrl(cover);

const mapState = ({ uiState: { theme, reduceMotion, softwareRendering, currentSong, streamTitle, streamArt } }: RootState) => ({
  theme,
  reduceMotion: reduceMotion || softwareRendering,
  cover: resolved(currentSong ? toNowPlaying(currentSong, streamTitle, streamArt).cover : undefined),
});

const mapDispatch = () => ({ readAccent: coverAccent });

export default connect(mapState, mapDispatch)(ThemeProvider);
