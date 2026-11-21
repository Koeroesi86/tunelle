import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import { getBackend } from '../../../backend/backend';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import WindowBlur from '../../../components/settings/window-blur/WindowBlur';

// macOS blurs the window itself, there is nothing to choose
const mapState = ({ uiState: { desktopBlur } }: RootState) => ({ available: !getBackend().capabilities.blur, enabled: desktopBlur });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  toggle: () => dispatch({ type: 'TOGGLE_DESKTOP_BLUR', payload: {} }),
});

export default connect(mapState, mapDispatch)(WindowBlur);
