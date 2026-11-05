import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FolderFilter from './FolderFilter';

const folders = ['/music/a', '/music/b', '/music/c'].map((path) => ({ path, lastModified: 1 }));

const toggle = () => screen.getByRole('button', { name: /^Show folders/ });
const boxes = () => screen.queryAllByRole<HTMLInputElement>('checkbox');
const open = () => fireEvent.click(toggle());

describe('FolderFilter', () => {
  it('shows all folders, closed, with all of them checked once opened', () => {
    render(<FolderFilter folders={folders} selected={[]} setSelected={vi.fn()} />);

    expect(toggle().textContent).toBe('All folders');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(boxes()).toHaveLength(0);

    open();

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(boxes().map((box) => box.checked)).toEqual([true, true, true]);
    expect(screen.getByRole('group', { name: 'Show folders' }).id).toBe(toggle().getAttribute('aria-controls'));
  });

  it('shows the number of the selected folders and checks those', () => {
    render(<FolderFilter folders={folders} selected={['/music/b', '/music/c']} setSelected={vi.fn()} />);

    expect(toggle().textContent).toBe('2 folders');
    open();
    expect(boxes().map((box) => box.checked)).toEqual([false, true, true]);
  });

  it('says one folder in the singular', () => {
    render(<FolderFilter folders={folders} selected={['/music/b']} setSelected={vi.fn()} />);

    expect(toggle().textContent).toBe('1 folder');
  });

  it('ignores a selected folder the library does not have', () => {
    render(<FolderFilter folders={folders} selected={['/music/gone']} setSelected={vi.fn()} />);

    expect(toggle().textContent).toBe('All folders');
    open();
    expect(boxes().map((box) => box.checked)).toEqual([true, true, true]);
  });

  it('unchecks a folder of all, which selects the others', () => {
    const setSelected = vi.fn();
    render(<FolderFilter folders={folders} selected={[]} setSelected={setSelected} />);
    open();

    fireEvent.click(boxes()[1]);

    expect(setSelected).toHaveBeenCalledWith(['/music/a', '/music/c']);
  });

  it('checks a folder of the selection, and all folders checked is no selection', () => {
    const setSelected = vi.fn();
    const { rerender } = render(<FolderFilter folders={folders} selected={['/music/a']} setSelected={setSelected} />);
    open();

    fireEvent.click(boxes()[2]);
    rerender(<FolderFilter folders={folders} selected={['/music/a', '/music/c']} setSelected={setSelected} />);
    fireEvent.click(boxes()[1]);

    expect(setSelected.mock.calls).toEqual([[['/music/a', '/music/c']], [[]]]);
  });

  it('selects all and clears, and a clear leaves the boxes unchecked while the collection shows everything', () => {
    const setSelected = vi.fn();
    render(<FolderFilter folders={folders} selected={['/music/a']} setSelected={setSelected} />);
    open();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(boxes().map((box) => box.checked)).toEqual([false, false, false]);
    fireEvent.click(boxes()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));

    expect(setSelected.mock.calls).toEqual([[[]], [['/music/a']], [[]]]);
    expect(boxes().map((box) => box.checked)).toEqual([true, true, true]);
  });

  it('closes with Escape and gives the focus back to the button', () => {
    render(<FolderFilter folders={folders} selected={[]} setSelected={vi.fn()} />);
    open();
    boxes()[0].focus();

    fireEvent.keyDown(boxes()[0], { key: 'Escape' });

    expect(boxes()).toHaveLength(0);
    expect(document.activeElement).toBe(toggle());
  });

  it('closes when the focus leaves it, and stays open while the focus moves inside it', () => {
    render(
      <>
        <FolderFilter folders={folders} selected={[]} setSelected={vi.fn()} />
        <button>outside</button>
      </>
    );
    open();

    fireEvent.blur(boxes()[0], { relatedTarget: boxes()[1] });
    expect(boxes()).toHaveLength(3);

    fireEvent.blur(boxes()[0], { relatedTarget: screen.getByText('outside') });
    expect(boxes()).toHaveLength(0);
  });

  it('closes with a second click on the button, and forgets what was cleared', () => {
    render(<FolderFilter folders={folders} selected={[]} setSelected={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    open();
    open();

    expect(boxes().map((box) => box.checked)).toEqual([true, true, true]);
  });

  it('lists nothing to pick for a library without folders', () => {
    render(<FolderFilter folders={[]} selected={[]} setSelected={vi.fn()} />);
    open();

    expect(toggle().textContent).toBe('All folders');
    expect(boxes()).toHaveLength(0);
  });
});
