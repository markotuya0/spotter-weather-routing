import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ForecastSlider } from './ForecastSlider';

const START = '2026-10-22T20:00:00Z';

describe('ForecastSlider', () => {
  it('exposes a 0–48 h slider with an accessible name and a time value text', () => {
    const { getByRole } = render(<ForecastSlider startTime={START} hour={6} onChange={vi.fn()} />);

    const slider = getByRole('slider', { name: /forecast frame/i });
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '48');
    expect(slider).toHaveAttribute('aria-valuenow', '6');
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringContaining('+6 h'));
  });

  it('reports a new hour when the value changes by one step at a time', () => {
    const onChange = vi.fn();
    const { getByRole } = render(<ForecastSlider startTime={START} hour={0} onChange={onChange} />);

    fireEvent.change(getByRole('slider'), { target: { value: '1' } });

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('shows the selected frame in its label', () => {
    const { getByText } = render(<ForecastSlider startTime={START} hour={48} onChange={vi.fn()} />);

    expect(getByText(/forecast frame: .* · \+48 h/i)).toBeInTheDocument();
  });
});
