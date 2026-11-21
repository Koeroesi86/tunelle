import type { Dispatch } from 'redux';
import type { SourceBrowse } from '@shared/schemas/sources';
import type { AppAction } from '../../redux/types';
import { createPageCache } from '../../redux/library/pages';
import { listKey, pageRequest } from '../../redux/sources/lists';

/** The list of a request that nothing answered yet: it loads its first page */
export const unanswered = createPageCache<never>();

const loaders = new WeakMap<Dispatch<AppAction>, Map<string, (page: number) => void>>();

/** A list of a server is asked a page at a time; the same list gets the same function, as the page loader runs again for a new one */
export const loadSourcePage = (dispatch: Dispatch<AppAction>, request: SourceBrowse) => {
  const known = loaders.get(dispatch) ?? new Map<string, (page: number) => void>();
  const key = listKey(request);
  const loader = known.get(key) ?? ((page: number) => dispatch({ type: 'BROWSE_SOURCE', payload: { request: pageRequest(request, page) } }));

  loaders.set(dispatch, known.set(key, loader));
  return loader;
};
