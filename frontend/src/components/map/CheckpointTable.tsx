import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useEffect, useRef } from 'react';
import type { Checkpoint, WeatherSample } from '../../api/types';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { RiskBadge } from '../common/RiskBadge';
import { formatMiles, formatTime } from '../common/format';

interface CheckpointTableProps {
  checkpoints: Checkpoint[];
  weatherSamples: Record<string, WeatherSample>;
  selectedIndex: number | null;
  onSelectCheckpoint: (index: number) => void;
  /** Grow to fill the parent's height instead of capping at 240px (used by the tablet drawer). */
  fill?: boolean;
}

export function CheckpointTable({
  checkpoints,
  weatherSamples,
  selectedIndex,
  onSelectCheckpoint,
  fill = false,
}: CheckpointTableProps) {
  const isMobile = useMediaQuery('(max-width:767.98px)');
  const rowRefs = useRef<Record<number, HTMLElement | null>>({});
  const prefersReducedMotion = usePrefersReducedMotion();

  // A checkpoint picked on the map scrolls its row into view here; a row clicked directly is
  // already visible, so `nearest` makes that a no-op instead of an unwanted jump.
  useEffect(() => {
    if (selectedIndex === null) return;
    rowRefs.current[selectedIndex]?.scrollIntoView?.({
      block: 'nearest',
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [selectedIndex, prefersReducedMotion]);

  if (checkpoints.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        No checkpoints for this route.
      </Typography>
    );
  }

  // Mobile shows the list only; tapping a row selects it, and the drawer that hosts this list
  // switches to the full checkpoint-details view (its own mutually exclusive state), so the
  // detail content below is not duplicated here.
  if (isMobile) {
    return (
      <List sx={{ maxHeight: 320, overflowY: 'auto', py: 0 }} aria-label="Checkpoints">
        {checkpoints.map((checkpoint) => {
          const selected = checkpoint.index === selectedIndex;
          return (
            <ListItemButton
              key={checkpoint.index}
              ref={(el: HTMLElement | null) => {
                rowRefs.current[checkpoint.index] = el;
              }}
              selected={selected}
              onClick={() => onSelectCheckpoint(checkpoint.index)}
              sx={{
                gap: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
              }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {formatMiles(checkpoint.distance_miles)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {formatTime(checkpoint.eta)}
                </Typography>
                <RiskBadge level={checkpoint.risk.level} size="small" />
              </Stack>
              <ChevronRightIcon fontSize="small" sx={{ flexShrink: 0, color: 'text.secondary' }} />
            </ListItemButton>
          );
        })}
      </List>
    );
  }

  return (
    <TableContainer sx={fill ? { flex: 1, minHeight: 0 } : { maxHeight: 240 }}>
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
                ref={(el) => {
                  rowRefs.current[checkpoint.index] = el;
                }}
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
