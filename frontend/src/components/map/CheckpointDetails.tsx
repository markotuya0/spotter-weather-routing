import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Checkpoint, WeatherSample } from '../../api/types';
import { RiskBadge } from '../common/RiskBadge';
import { formatMiles, formatTime, formatTimeRange } from '../common/format';
import { describeLoadRule } from '../results/loadRuleText';

interface CheckpointDetailsProps {
  checkpoint: Checkpoint;
  weatherSample: WeatherSample | null;
  loadWeightLb: number;
}

function unavailableReasonText(reason: Checkpoint['risk']['reason']): string {
  if (reason === 'beyond_forecast') return 'Weather unavailable at this point (beyond the forecast horizon)';
  return 'Weather unavailable at this point';
}

export function CheckpointDetails({ checkpoint, weatherSample, loadWeightLb }: CheckpointDetailsProps) {
  const { risk } = checkpoint;
  const loadRuleText = describeLoadRule(risk.load_rule.rule);

  return (
    <Stack spacing={0.75}>
      <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        Mile {formatMiles(checkpoint.distance_miles)} &middot; ETA {formatTime(checkpoint.eta)}
      </Typography>
      <RiskBadge level={risk.level} size="small" />

      {!weatherSample ? (
        <Typography variant="body2" color="text.secondary">
          {unavailableReasonText(risk.reason)}
        </Typography>
      ) : (
        <>
          <Typography variant="body2">
            Wind {weatherSample.wind_mph.toFixed(1)} mph &middot; Rain{' '}
            {weatherSample.rain_in_per_hr.toFixed(2)} in/hr &middot; Snow{' '}
            {weatherSample.snow_in_per_hr.toFixed(2)} in/hr
          </Typography>
          {risk.drivers.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              Driven by: {risk.drivers.join(', ')}
            </Typography>
          )}
          {risk.load_rule.applied && loadRuleText && (
            <Typography variant="body2" color="text.secondary">
              Load rule applied ({loadWeightLb.toLocaleString()} lb): {loadRuleText}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Forecast hour used: {formatTimeRange(weatherSample.wind_time_used[0], weatherSample.wind_time_used[1])}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Conditions at arrival
          </Typography>
        </>
      )}
    </Stack>
  );
}
