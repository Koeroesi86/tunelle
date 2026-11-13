import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { fetchGroupCover } from '../../../services/library-api';
import ArtistPhoto from './ArtistPhoto';

vi.mock('../../../services/library-api', () => ({ fetchGroupCover: vi.fn() }));
vi.mock('../../../services/local-url', () => ({ localUrl: (route: string) => `http://local${route}` }));

describe('ArtistPhoto', () => {
  beforeEach(() => {
    vi.mocked(fetchGroupCover).mockReset();
  });

  it('shows the photo or cover of the group, and fetches it again when a photo was changed', async () => {
    vi.mocked(fetchGroupCover).mockResolvedValueOnce('artist-a.jpg').mockResolvedValueOnce('artist-b.png');
    const { container, rerender } = render(<ArtistPhoto kind="artist" photoKey="adam" revision={0} />);
    const photo = () => container.querySelector<HTMLElement>('span')?.style.backgroundImage;

    await waitFor(() => expect(photo()).toContain('artist-a-optimized.png'));
    rerender(<ArtistPhoto kind="artist" photoKey="adam" revision={1} />);

    await waitFor(() => expect(photo()).toContain('artist-b-optimized.png'));
    expect(fetchGroupCover).toHaveBeenCalledWith('artist', 'adam');
  });

  it('is an empty circle for a group with no picture', async () => {
    vi.mocked(fetchGroupCover).mockResolvedValue(null);
    const { container } = render(<ArtistPhoto kind="albumArtist" photoKey="adam" revision={0} />);

    await waitFor(() => expect(fetchGroupCover).toHaveBeenCalled());
    expect(container.querySelector<HTMLElement>('span')?.style.backgroundImage).toBe('');
  });
});
