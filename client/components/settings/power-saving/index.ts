import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { PowerSavingMode } from '@shared/schemas/settings';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import PowerSaving from './PowerSaving';

const mapState = ({ uiState }: RootState) => ({ mode: uiState.powerSaving, saving: uiState.savingPower });

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({
  setMode: (mode: PowerSavingMode) => dispatch({ type: 'SET_POWER_SAVING', payload: { mode } }),
});

export default connect(mapState, mapDispatch)(PowerSaving);
