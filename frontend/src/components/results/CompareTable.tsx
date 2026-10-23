import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState } from 'react';
import type { Route } from '../../api/types';
import { formatDuration, formatMiles, formatTime } from '../common/format';

interface Row {
  label: string;
  values: (route: Route) => string;
  decidingKey?: keyof Route['ranking_keys'];
}

const ROWS: Row[] = [
  { label: 'Duration', values: (r) => formatDuration(r.summary.duration_seconds) },
  { label: 'Distance', values: (r) => formatMiles(r.summary.distance_miles) },
  { label: 'No Travel miles', values: (r) => formatMiles(r.ranking_keys.no_travel_miles), decidingKey: 'no_travel_miles' },
  { label: 'Severe miles', values: (r) => formatMiles(r.ranking_keys.severe_miles), decidingKey: 'severe_miles' },
  { label: 'High miles', values: (r) => formatMiles(r.ranking_keys.high_miles), decidingKey: 'high_miles' },
  { label: 'Average risk', values: (r) => r.ranking_keys.average_risk.toFixed(2), decidingKey: 'average_risk' },
  { label: 'Arrival', values: (r) => formatTime(r.summary.arrival_time) },
];

function winnerRouteId(routes: Route[], key: keyof Route['ranking_keys']): string | null {
  if (routes.length === 0) return null;
  let best = routes[0]!;
  for (const route of routes) {
    if (route.ranking_keys[key] < best.ranking_keys[key]) best = route;
  }
  return best.id;
}

function BestMark() {
  return (
    <Box component="span" sx={{ ml: 1, fontWeight: 700, color: 'primary.main' }}>
      Best
    </Box>
  );
}

export function CompareTable({ routes }: { routes: Route[] }) {
  const isMobile = useMediaQuery('(max-width:767.98px)');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isMobile) {
    return (
      <List sx={{ py: 0 }} aria-label="Route comparison">
        {routes.map((route) => {
          const expanded = route.id === expandedId;
          return (
            <Box key={route.id} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
              <ListItemButton
                aria-expanded={expanded}
                onClick={() => setExpandedId((current) => (current === route.id ? null : route.id))}
                sx={{
                  gap: 1,
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                  {route.name}
                </Typography>
                <ExpandMoreIcon
                  fontSize="small"
                  sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', flexShrink: 0 }}
                />
              </ListItemButton>
              <Collapse in={expanded} unmountOnExit>
                <Stack spacing={0.5} sx={{ px: 2, pb: 1.5 }}>
                  {ROWS.map((row) => {
                    const winnerId = row.decidingKey ? winnerRouteId(routes, row.decidingKey) : null;
                    return (
                      <Stack key={row.label} direction="row" sx={{ justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">
                          {row.label}
                        </Typography>
                        <Typography variant="body2">
                          {row.values(route)}
                          {winnerId === route.id && <BestMark />}
                        </Typography>
                      </Stack>
                    );
                  })}
                </Stack>
              </Collapse>
            </Box>
          );
        })}
      </List>
    );
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-label="Route comparison">
        <TableHead>
          <TableRow>
            <TableCell>Metric</TableCell>
            {routes.map((route) => (
              <TableCell key={route.id}>{route.name}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {ROWS.map((row) => {
            const winnerId = row.decidingKey ? winnerRouteId(routes, row.decidingKey) : null;
            return (
              <TableRow key={row.label}>
                <TableCell component="th" scope="row">
                  {row.label}
                </TableCell>
                {routes.map((route) => (
                  <TableCell key={route.id}>
                    {row.values(route)}
                    {winnerId === route.id && <BestMark />}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}
