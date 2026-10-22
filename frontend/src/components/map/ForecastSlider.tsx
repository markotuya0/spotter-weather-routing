import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { FORECAST_MAX_HOUR, formatForecastLabel } from './forecastTime';

interface ForecastSliderProps {
  startTime: string;
  hour: number;
  onChange: (hour: number) => void;
}

const MARKS = [0, 12, 24, 36, 48].map((value) => ({ value, label: `${value} h` }));

/**
 * Below 1200 px the "Checkpoints" button is pinned to the bottom-left of the map region, so the slider
 * reserves that band (`pb`) to keep both controls operable and unobscured.
 * 0–48 h forecast frame selector (`06` §6). Moving it only picks an already-fetched frame: it never
 * issues a request and never changes the recommendation or checkpoint risk (`05` §10 invariant).
 */
export function ForecastSlider({ startTime, hour, onChange }: ForecastSliderProps) {
  const label = formatForecastLabel(startTime, hour);
  return (
    <Box sx={{ px: 2, pt: 1, pb: { xs: 6.5, lg: 0.5 }, borderTop: 1, borderColor: 'divider', backgroundColor: 'background.paper' }}>
      <Typography variant="caption" component="p" color="text.secondary" id="forecast-slider-label">
        Forecast frame: {label}
      </Typography>
      {/* Inset so the 0 h / 48 h end marks and thumb sit inside the panel, not on its edge. */}
      <Box sx={{ px: 1.5 }}>
        <Slider
          aria-labelledby="forecast-slider-label"
          getAriaValueText={() => label}
          value={hour}
          min={0}
          max={FORECAST_MAX_HOUR}
          step={1}
          marks={MARKS}
          onChange={(_event, value) => {
            if (typeof value === 'number') onChange(value);
          }}
          sx={{
            py: 1.5,
            // Stronger than MUI's default 16% halo so keyboard focus is clearly visible (WCAG 2.4.7).
            '& .MuiSlider-thumb.Mui-focusVisible, & .MuiSlider-thumb:focus-visible': {
              boxShadow: '0 0 0 3px #FFFFFF, 0 0 0 5px #0E5F70',
            },
          }}
        />
      </Box>
    </Box>
  );
}
