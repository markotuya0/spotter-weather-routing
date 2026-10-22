import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { RiskLevel } from '../../api/types';
import { RISK_ORDER, RISK_STYLES } from '../../theme/riskColors';
import { formatForecastLabel } from './forecastTime';

const LEGEND_LEVELS: RiskLevel[] = [...RISK_ORDER, 'unknown'];

interface HeatmapLegendProps {
  startTime: string;
  hour: number;
  pointCount: number;
  loadWeightLb?: number;
}

/**
 * Compact legend for the conditions heatmap (`06` §6). Every level has a glyph and a text label,
 * so risk is never conveyed by colour alone (N-04). Unknown is labelled explicitly, never as Low;
 * the full explanation of missing data sits behind a disclosure to keep the default view short.
 */
export function HeatmapLegend({ startTime, hour, pointCount, loadWeightLb }: HeatmapLegendProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <Paper
      component="section"
      aria-label="Conditions heatmap legend"
      sx={{
        position: 'absolute',
        left: 12,
        // Clear MapLibre's attribution strip (about 24 px) so the last line is never covered.
        bottom: 40,
        p: 1,
        maxWidth: 'min(calc(100% - 24px), 420px)',
        backgroundColor: 'background.paper',
        opacity: 0.95,
      }}
    >
      {pointCount === 0 ? (
        <Typography variant="caption" component="p" color="text.secondary">
          No forecast points for this corridor.
        </Typography>
      ) : (
        <Typography variant="caption" component="p" color="text.secondary">
          {formatForecastLabel(startTime, hour)}
          {hour === 0 && ' (departure)'}
          {loadWeightLb !== undefined && ` · ${loadWeightLb.toLocaleString()} lb load`}
        </Typography>
      )}
      <Box component="ul" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, m: 0, mt: 0.5, p: 0, listStyle: 'none' }}>
        {LEGEND_LEVELS.map((level) => {
          const style = RISK_STYLES[level];
          return (
            <Box component="li" key={level} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box component="span" aria-hidden sx={{ color: style.color, fontWeight: 700, fontSize: 13 }}>
                {style.glyph}
              </Box>
              <Typography variant="caption" component="span" sx={{ color: 'text.primary' }}>
                {style.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
      <Typography variant="caption" component="p" sx={{ mt: 0.5, color: 'text.primary' }}>
        Unknown is not Low: no forecast there.
      </Typography>
      <Button
        size="small"
        variant="text"
        aria-expanded={detailsOpen}
        aria-controls="heatmap-legend-details"
        onClick={() => setDetailsOpen((open) => !open)}
        sx={{ mt: 0.5, p: 0, minWidth: 0, fontSize: 12 }}
      >
        {detailsOpen ? 'Hide details' : 'About unknown data'}
      </Button>
      <Collapse in={detailsOpen} unmountOnExit>
        <Typography id="heatmap-legend-details" variant="caption" component="p" color="text.secondary" sx={{ mt: 0.5 }}>
          Unknown: no forecast for that point and hour, not shown as Low. No blob: no forecast point there, so it is
          not confirmed safe.
        </Typography>
      </Collapse>
    </Paper>
  );
}
