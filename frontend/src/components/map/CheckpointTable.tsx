import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import type { Checkpoint, WeatherSample } from '../../api/types';
import { RiskBadge } from '../common/RiskBadge';
import { formatMiles, formatTime } from '../common/format';

interface CheckpointTableProps {
  checkpoints: Checkpoint[];
  weatherSamples: Record<string, WeatherSample>;
  selectedIndex: number | null;
  onSelectCheckpoint: (index: number) => void;
}

export function CheckpointTable({
  checkpoints,
  weatherSamples,
  selectedIndex,
  onSelectCheckpoint,
}: CheckpointTableProps) {
  if (checkpoints.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        No checkpoints for this route.
      </Typography>
    );
  }

  return (
    <TableContainer sx={{ maxHeight: 240 }}>
      <Table size="small" stickyHeader aria-label="Checkpoints">
        <TableHead>
          <TableRow>
            <TableCell>Mile</TableCell>
            <TableCell>ETA</TableCell>
            <TableCell>Level</TableCell>
            <TableCell>Wind</TableCell>
            <TableCell>Rain</TableCell>
            <TableCell>Snow</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {checkpoints.map((checkpoint) => {
            const sample = checkpoint.weather_sample_id ? weatherSamples[checkpoint.weather_sample_id] : null;
            const selected = checkpoint.index === selectedIndex;
            return (
              <TableRow
                key={checkpoint.index}
                hover
                selected={selected}
                aria-selected={selected}
                onClick={() => onSelectCheckpoint(checkpoint.index)}
                // Rows are operable from the keyboard too (Enter/Space), with a visible focus ring.
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectCheckpoint(checkpoint.index);
                  }
                }}
                sx={{ cursor: 'pointer', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}
              >
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMiles(checkpoint.distance_miles)}</TableCell>
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(checkpoint.eta)}</TableCell>
                <TableCell>
                  <RiskBadge level={checkpoint.risk.level} size="small" />
                </TableCell>
                <TableCell>{sample ? `${sample.wind_mph.toFixed(1)} mph` : '—'}</TableCell>
                <TableCell>{sample ? `${sample.rain_in_per_hr.toFixed(2)} in/hr` : '—'}</TableCell>
                <TableCell>{sample ? `${sample.snow_in_per_hr.toFixed(2)} in/hr` : '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
