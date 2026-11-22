import type { Dispatch } from 'redux';
import type { SourceBrowse } from '@shared/schemas/sources';
import type { AppAction } from '../../redux/types';
import { createPageCache } from '../../domain/page-cache';
import { pageRequest } from '../../domain/source-library';
import { listKey } from '../../redux/sources/lists';

/** The pages after the window that are fetched ahead: a server answers late, and a scroll is fast */
export const pagesAhead = 2;

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

const keepers = new WeakMap<Dispatch<AppAction>, Map<string, (pages: number[]) => void>>();

/** Tells the main process which pages of a list are wanted now, so that the pages it still has queued for others are not fetched; one function for a list, as a loader is */
export const keepSourcePages = (dispatch: Dispatch<AppAction>, request: SourceBrowse) => {
  const known = keepers.get(dispatch) ?? new Map<string, (pages: number[]) => void>();
  const key = listKey(request);
  const keeper = known.get(key) ?? ((pages: number[]) => dispatch({ type: 'KEEP_SOURCE_PAGES', payload: { request: pageRequest(request, 0), pages } }));

  keepers.set(dispatch, known.set(key, keeper));
  return keeper;
};
