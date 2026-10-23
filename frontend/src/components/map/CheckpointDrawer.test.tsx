import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCheckpoint } from '../../test/fixtures';
import { CheckpointDrawer } from './CheckpointDrawer';

/** Forces MUI's `useMediaQuery('(max-width:767.98px)')` to report mobile, matching the real narrow-viewport case. */
function stubMobileViewport() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CheckpointDrawer', () => {
  it('opens the collapsed desktop panel when a checkpoint is selected from outside it (e.g. the map)', () => {
    const checkpoints = [buildCheckpoint({ index: 0 }), buildCheckpoint({ index: 1 })];
    const { rerender } = render(
      <CheckpointDrawer checkpoints={checkpoints} weatherSamples={{}} selectedIndex={null} onSelectCheckpoint={vi.fn()} />,
    );

    expect(screen.queryByRole('table', { name: 'Checkpoints' })).not.toBeInTheDocument();

    rerender(
      <CheckpointDrawer checkpoints={checkpoints} weatherSamples={{}} selectedIndex={1} onSelectCheckpoint={vi.fn()} />,
    );

    expect(screen.getByRole('table', { name: 'Checkpoints' })).toBeInTheDocument();
  });

  describe('on a narrow (mobile) viewport', () => {
    it('shows the list and details as one sheet with mutually exclusive states, navigable via Back and Close', () => {
      stubMobileViewport();
      const onSelectCheckpoint = vi.fn();
      const checkpoints = [buildCheckpoint({ index: 0 }), buildCheckpoint({ index: 1 })];

      const { rerender } = render(
        <CheckpointDrawer
          checkpoints={checkpoints}
          weatherSamples={{}}
          selectedIndex={null}
          onSelectCheckpoint={onSelectCheckpoint}
        />,
      );

      // A checkpoint picked on the map opens straight into the details view, not the list.
      rerender(
        <CheckpointDrawer
          checkpoints={checkpoints}
          weatherSamples={{}}
          selectedIndex={0}
          onSelectCheckpoint={onSelectCheckpoint}
        />,
      );
      expect(screen.getByRole('button', { name: /back to list/i })).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Checkpoints' })).not.toBeInTheDocument();

      // Back returns to the list without clearing the selection (map keeps its highlight).
      fireEvent.click(screen.getByRole('button', { name: /back to list/i }));
      expect(screen.getByRole('list', { name: 'Checkpoints' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /back to list/i })).not.toBeInTheDocument();

      // Close dismisses the sheet entirely and clears the selection.
      fireEvent.click(screen.getByRole('button', { name: /close checkpoints/i }));
      expect(onSelectCheckpoint).toHaveBeenLastCalledWith(null);
    });
  });
});
