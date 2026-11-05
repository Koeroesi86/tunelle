import type { Dispatch, Middleware, MiddlewareAPI } from 'redux';
import type { RootState } from './reducers';
import { isAppAction } from './types';
import type { AppAction } from './types';

export type Store = MiddlewareAPI<Dispatch<AppAction>, RootState>;
type ActionHandler = (action: AppAction) => void;

const isActionOfType = <T extends AppAction['type']>(action: AppAction, type: T): action is Extract<AppAction, { type: T }> => action.type === type;

/** A handler that runs for the actions of one type only */
export const onAction =
  <T extends AppAction['type']>(type: T, run: (action: Extract<AppAction, { type: T }>) => void): ActionHandler =>
  (action) => {
    if (isActionOfType(action, type)) run(action);
  };

/** A middleware that passes every action to its handlers before the next middleware, a new action type needs a new handler and no other change */
export const actionMiddleware =
  (createHandlers: (store: Store) => ActionHandler[]): Middleware<object, RootState> =>
  (store) => {
    const handlers = createHandlers(store);

    return (next) => (action) => {
      if (!isAppAction(action)) return next(action);

      handlers.forEach((handle) => handle(action));
      return next(action);
    };
  };
