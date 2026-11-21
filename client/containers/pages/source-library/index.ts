import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { SourceKind } from '@shared/schemas/sources';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import SourceLibrary from '../../../components/pages/source-library/SourceLibrary';

const mapState = ({ sources }: RootState, { kind }: { kind: SourceKind }) => ({
  servers: sources.servers.filter((server) => server.kind === kind),
  browsed: sources.browsed,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({ load: () => dispatch({ type: 'LOAD_SOURCE_SERVERS' }) });

export default connect(mapState, mapDispatch)(SourceLibrary);
