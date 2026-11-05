import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { ThemeMode } from '@shared/types/theme';
import type { RootState } from '../../client/redux/reducers';
import type { AppAction } from '../../client/redux/types';
import ThemeSelect from './ThemeSelect';

const mapState = (state: RootState) => ({ theme: state.uiState.theme });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setMode: (mode: ThemeMode) => dispatch({ type: 'SET_THEME_MODE', payload: { mode } }),
  setAccent: (accent: string | undefined) => dispatch({ type: 'SET_ACCENT', payload: { accent } }),
});

export default connect(mapState, mapDispatch)(ThemeSelect);
