import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Typography from '@mui/material/Typography';
import type { Recommendation as RecommendationType, Route } from '../../api/types';

const FALLBACK_TEXT: Record<'incomplete_data' | 'no_safe_route', string> = {
  incomplete_data: 'No route has complete weather data; showing the best available with partial data.',
  no_safe_route: 'No safe route for this departure time and load.',
};

export function Recommendation({
  recommendation,
  routes,
}: {
  recommendation: RecommendationType;
  routes: Route[];
}) {
  if (recommendation.fallback_level !== 'none') {
    return (
      <Alert severity={recommendation.fallback_level === 'no_safe_route' ? 'error' : 'warning'} role="alert">
        <AlertTitle>Not confirmed safe</AlertTitle>
        {FALLBACK_TEXT[recommendation.fallback_level]}
      </Alert>
    );
  }

  const recommendedRoute = routes.find((route) => route.id === recommendation.route_id);
  const topReason = recommendation.reasons.find((reason) => reason.decisive) ?? recommendation.reasons[0];

  return (
    <Alert severity="success" icon={false}>
      <AlertTitle>
        Recommended: {recommendedRoute?.name ?? 'Route'}
      </AlertTitle>
      {topReason && <Typography variant="body2">{topReason.text}</Typography>}
    </Alert>
  );
}
