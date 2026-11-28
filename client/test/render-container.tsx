import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import reducers from '../redux/reducers';
import type { RootState } from '../redux/reducers';

/** A container over a store of the app, in the state that `change` makes of the first one; `sent` gives what was dispatched. See docs/development/containers.md */
export const renderContainer = (container: ReactElement, change: (state: RootState) => RootState = (state) => state) => {
  const store = createStore(reducers, change(createStore(reducers).getState()));
  const dispatch = vi.spyOn(store, 'dispatch');
  const result = render(<Provider store={store}>{container}</Provider>);

  return { ...result, store, sent: () => dispatch.mock.calls.map(([action]) => action) };
};

/** What the container passed to its view the last time, for a view that the test mocks with `vi.fn()` */
export const propsOf = <Props,>(view: (props: Props) => unknown): Props => {
  const call = vi.mocked(view).mock.lastCall;
  if (!call) throw new Error('the view was not rendered');
  return call[0];
};
