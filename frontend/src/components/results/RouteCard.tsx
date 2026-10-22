import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { alpha } from '@mui/material/styles';
import type { Route } from '../../api/types';
import { RiskBadge } from '../common/RiskBadge';
import { Duration, Miles, TimeText, formatDuration, formatMiles } from '../common/format';
import { RiskRibbon } from './RiskRibbon';
import { describeBlockedReason, describeIncompleteReason } from './eligibilityReason';

interface RouteCardProps {
  route: Route;
  isTopPick: boolean;
  isConfirmedSafe: boolean;
  selected: boolean;
  onSelect: (routeId: string) => void;
  /** Recommended route's duration, for a "+N min vs recommended" comparison on other cards. */
  recommendedDurationSeconds?: number;
}

export function RouteCard({
  route,
  isTopPick,
  isConfirmedSafe,
  selected,
  onSelect,
  recommendedDurationSeconds,
}: RouteCardProps) {
  const { summary, ranking_keys: keys, eligibility } = route;
  const isRecommended = isTopPick && isConfirmedSafe;
  const durationDeltaSeconds =
    !isRecommended && recommendedDurationSeconds !== undefined
      ? summary.duration_seconds - recommendedDurationSeconds
      : null;

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
        backgroundColor: (t) => (isRecommended ? alpha(t.palette.success.main, 0.08) : t.palette.background.paper),
        boxShadow: selected ? 2 : 0,
        transition: 'box-shadow 120ms, border-color 120ms',
      }}
    >
      <Stack spacing={1}>
        <Stack
          component="button"
          type="button"
          onClick={() => onSelect(route.id)}
          direction="row"
          useFlexGap
          sx={{
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            flexWrap: 'wrap',
            gap: 1,
            justifyContent: 'space-between',
            alignItems: 'center',
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 4, borderRadius: 1 },
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
            {selected && <CheckCircleIcon color="primary" fontSize="small" aria-hidden="true" />}
            <Typography variant="h6" component="span" sx={{ overflowWrap: 'anywhere' }}>
              {route.name}
            </Typography>
          </Stack>
          {isRecommended && <Chip color="primary" size="small" label="Recommended" />}
          {isTopPick && !isConfirmedSafe && (
            <Chip color="warning" variant="outlined" size="small" label="Not confirmed safe" />
          )}
        </Stack>

        {route.via && (
          <Typography variant="body2" color="text.secondary">
            via {route.via}
          </Typography>
        )}

        <Typography variant="body2">
          <Duration seconds={summary.duration_seconds} /> · <Miles value={summary.distance_miles} />
        </Typography>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', rowGap: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Arrives <TimeText iso={summary.arrival_time} />
          </Typography>
          {durationDeltaSeconds !== null && Math.abs(durationDeltaSeconds) >= 60 && (
            <Chip
              size="small"
              variant="outlined"
              label={`${durationDeltaSeconds > 0 ? '+' : '-'}${formatDuration(Math.abs(durationDeltaSeconds))} vs recommended`}
            />
          )}
        </Stack>

        <Box>
          <RiskRibbon route={route} />
        </Box>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', rowGap: 0.5 }}>
          <RiskBadge level={summary.max_level} size="small" />
          <Typography variant="body2" color="text.secondary">
            Severe {formatMiles(keys.severe_miles)} · High {formatMiles(keys.high_miles)} · Avg risk{' '}
            {keys.average_risk.toFixed(2)}
          </Typography>
        </Stack>

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
