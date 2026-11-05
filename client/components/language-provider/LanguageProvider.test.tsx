import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Confirm from '../confirm';
import LanguageProvider from './LanguageProvider';

const renderConfirm = (language?: string) =>
  render(
    <LanguageProvider language={language}>
      <Confirm message="?" cancel={vi.fn()} />
    </LanguageProvider>
  );

describe('LanguageProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the picked language over the system language', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    renderConfirm('hu');

    expect(screen.getByText('Igen')).toBeTruthy();
    expect(document.documentElement.lang).toBe('hu');
  });

  it('follows the system language without a picked one', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['hu-HU', 'en-US']);
    renderConfirm();

    expect(screen.getByText('Igen')).toBeTruthy();
  });

  it('shows English where the system language is not translated', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE']);
    renderConfirm();

    expect(screen.getByText('Yes')).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
  });

  it('shows English without a provider', () => {
    render(<Confirm message="?" cancel={vi.fn()} />);

    expect(screen.getByText('Yes')).toBeTruthy();
  });
});
