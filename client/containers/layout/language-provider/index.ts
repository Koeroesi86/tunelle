import { connect } from 'react-redux';
import type { RootState } from '../../../redux/reducers';
import LanguageProvider from '../../../components/layout/language-provider/LanguageProvider';

const mapState = (state: RootState) => ({ language: state.uiState.language });

export default connect(mapState)(LanguageProvider);
