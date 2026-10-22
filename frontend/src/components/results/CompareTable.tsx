import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Box from '@mui/material/Box';
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

export function CompareTable({ routes }: { routes: Route[] }) {
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
                    {winnerId === route.id && (
                      <Box component="span" sx={{ ml: 1, fontWeight: 700, color: 'primary.main' }}>
                        Best
                      </Box>
                    )}
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
