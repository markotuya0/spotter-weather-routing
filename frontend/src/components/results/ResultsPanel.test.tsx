import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../../theme/theme';
import { buildAnalysisResult, buildRoute } from '../../test/fixtures';
import { ResultsPanel } from './ResultsPanel';

function renderPanel(result = buildAnalysisResult({ routes: [buildRoute({ id: 'r1', rank: 1 }), buildRoute({ id: 'r2', rank: 2, name: 'Route 2' })] })) {
  return render(
    <ThemeProvider theme={theme}>
      <ResultsPanel
        result={result}
        isPending={false}
        error={undefined}
        onRetry={vi.fn()}
        selectedRouteId={null}
        onSelectRoute={vi.fn()}
      />
    </ThemeProvider>,
  );
}

describe('ResultsPanel', () => {
  it('collapses the full comparison table by default and toggles it on request', () => {
    renderPanel();
    expect(screen.queryByRole('table', { name: 'Route comparison' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /compare all routes/i }));
    expect(screen.getByRole('table', { name: 'Route comparison' })).toBeInTheDocument();

    const hideButton = screen.getByRole('button', { name: /hide full comparison/i });
    fireEvent.click(hideButton);
    expect(hideButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not show a comparison toggle for a single route', () => {
    renderPanel(buildAnalysisResult());
    expect(screen.queryByRole('button', { name: /compare all routes/i })).not.toBeInTheDocument();
  });
});
