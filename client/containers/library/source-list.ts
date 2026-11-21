import type { Dispatch } from 'redux';
import type { SourceBrowse } from '@shared/schemas/sources';
import type { AppAction } from '../../redux/types';
import { createPageCache } from '../../redux/library/pages';
import { pageRequest } from '../../redux/sources/lists';

/** The list of a request that nothing answered yet: it loads its first page */
export const unanswered = createPageCache<never>();

/** A list of a server is asked a page at a time, as the lists of the local library */
export const loadSourcePage = (dispatch: Dispatch<AppAction>, request: SourceBrowse) => (page: number) =>
  dispatch({ type: 'BROWSE_SOURCE', payload: { request: pageRequest(request, page) } });
