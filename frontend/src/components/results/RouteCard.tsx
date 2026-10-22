import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Route } from '../../api/types';
import { RiskBadge } from '../common/RiskBadge';
import { Duration, Miles, TimeText, formatMiles } from '../common/format';
import { RiskRibbon } from './RiskRibbon';
import { describeBlockedReason, describeIncompleteReason } from './eligibilityReason';

interface RouteCardProps {
  route: Route;
  isTopPick: boolean;
  isConfirmedSafe: boolean;
  selected: boolean;
  onSelect: (routeId: string) => void;
}

export function RouteCard({ route, isTopPick, isConfirmedSafe, selected, onSelect }: RouteCardProps) {
  const { summary, ranking_keys: keys, eligibility } = route;

  return (
    <Paper
      component="li"
      variant="outlined"
      aria-current={selected ? 'true' : undefined}
      sx={{
        p: 2,
        listStyle: 'none',
        borderColor: selected ? 'primary.main' : 'divider',
        borderWidth: selected ? 2 : 1,
      }}
    >
      <Stack spacing={1}>
        <Stack
          component="button"
          type="button"
          onClick={() => onSelect(route.id)}
          direction="row"
          spacing={1}
          sx={{
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip label={`#${route.rank}`} size="small" />
            <Typography variant="h6" component="span">
              {route.name}
            </Typography>
          </Stack>
          {isTopPick && isConfirmedSafe && <Chip color="primary" label="Recommended" />}
          {isTopPick && !isConfirmedSafe && (
            <Chip color="warning" variant="outlined" label="Not confirmed safe" />
          )}
        </Stack>

        {route.via && (
          <Typography variant="body2" color="text.secondary">
            via {route.via}
          </Typography>
        )}

        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
          <Typography variant="body2">
            <Duration seconds={summary.duration_seconds} /> · <Miles value={summary.distance_miles} />
          </Typography>
          <Typography variant="body2">
            Arrives <TimeText iso={summary.arrival_time} />
          </Typography>
        </Stack>

        <RiskRibbon route={route} />

        <Typography variant="body2" color="text.secondary">
          Severe {formatMiles(keys.severe_miles)} · High {formatMiles(keys.high_miles)} · Avg risk{' '}
          {keys.average_risk.toFixed(2)}
        </Typography>

        <Box>
          <RiskBadge level={summary.max_level} size="small" />
        </Box>

        {eligibility.status === 'blocked' && (
          <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>
            {describeBlockedReason(eligibility.reason)}
          </Typography>
        )}
        {eligibility.status === 'incomplete' && (
          <Typography variant="body2" color="warning.main" sx={{ fontWeight: 600 }}>
            {describeIncompleteReason(eligibility.reason)}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
