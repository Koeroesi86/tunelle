import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import LanguageSelect from './LanguageSelect';

const mapState = (state: RootState) => ({ language: state.uiState.language });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setLanguage: (language: string | undefined) => dispatch({ type: 'SET_LANGUAGE', payload: { language } }),
});

export default connect(mapState, mapDispatch)(LanguageSelect);
