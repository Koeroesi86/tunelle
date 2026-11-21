import type { ComponentProps } from 'react';
import { connect } from 'react-redux';
import type { Dispatch } from 'redux';
import type { SourceKind } from '@shared/schemas/sources';
import type { RootState } from '../../../redux/reducers';
import type { AppAction } from '../../../redux/types';
import SourceLibrary from '../../../components/pages/source-library/SourceLibrary';
import SourceAlbums from '../../library/source-albums';
import SourceArtists from '../../library/source-artists';
import SourceTracks from '../../library/source-tracks';

const renderAlbums: ComponentProps<typeof SourceLibrary>['renderAlbums'] = (request, open) => <SourceAlbums request={request} open={open} />;
const renderArtists: ComponentProps<typeof SourceLibrary>['renderArtists'] = (request, open) => <SourceArtists request={request} open={open} />;
const renderTracks: ComponentProps<typeof SourceLibrary>['renderTracks'] = (request, setTitleOrder) => (
  <SourceTracks request={request} setTitleOrder={setTitleOrder} />
);

const mapState = ({ sources }: RootState, { kind }: { kind: SourceKind }) => ({
  servers: sources.servers.filter((server) => server.kind === kind),
  browsed: sources.browsed,
});

const mapDispatch = (dispatch: Dispatch<AppAction>) => ({ load: () => dispatch({ type: 'LOAD_SOURCE_SERVERS' }), renderAlbums, renderArtists, renderTracks });

export default connect(mapState, mapDispatch)(SourceLibrary);
