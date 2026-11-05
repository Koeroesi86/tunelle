import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import reducers from '../../client/redux/reducers';
import Favourites from './index';

vi.mock('../favourite-button', () => ({ default: () => null }));
vi.mock('../add-to-queue', () => ({ default: () => null }));

describe('Favourites', () => {
  it('opens as it was left: the side and the order stay when the view is mounted again', () => {
    const store = createStore(reducers);
    const view = () => (
      <Provider store={store}>
        <Favourites />
      </Provider>
    );
    render(view());

    fireEvent.click(screen.getByRole('button', { name: /Online/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'name' } });
    cleanup();
    render(view());

    expect(screen.getByRole('button', { name: /Online/ }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('combobox', { name: 'Sort by' }) as HTMLSelectElement).value).toBe('name');
  });
});
