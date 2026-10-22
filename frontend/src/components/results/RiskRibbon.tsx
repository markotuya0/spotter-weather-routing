import { useId, useState } from 'react';
import Tooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import type { Route } from '../../api/types';
import { RISK_STYLES } from '../../theme/riskColors';
import { formatMiles } from '../common/format';

function summarize(route: Route): string {
  const parts = route.risk_segments.map((segment) => {
    const miles = segment.to_miles - segment.from_miles;
    return `${RISK_STYLES[segment.level].label} for ${formatMiles(miles)}`;
  });
  return `Risk by mile: ${parts.join(', ')}`;
}

export function RiskRibbon({ route, size = 'small' }: { route: Route; size?: 'small' | 'large' }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const id = useId();
  const height = size === 'large' ? 24 : 12;
  const distance = route.summary.distance_miles || 1;

  return (
    <Box
      role="img"
      aria-label={summarize(route)}
      sx={{
        display: 'flex',
        width: '100%',
        height,
        borderRadius: 1,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      {route.risk_segments.map((segment, index) => {
        const widthPct = ((segment.to_miles - segment.from_miles) / distance) * 100;
        const style = RISK_STYLES[segment.level];
        const label = `Mile ${segment.from_miles.toFixed(1)}–${segment.to_miles.toFixed(1)}: ${style.label}`;
        return (
          <Tooltip key={`${id}-${index}`} title={label} arrow>
            <Box
              component="button"
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-pressed={activeIndex === index}
              sx={{
                width: `${widthPct}%`,
                minWidth: 2,
                height: '100%',
                backgroundColor: style.color,
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                opacity: segment.level === 'unknown' ? 0.6 : 1,
              }}
            />
          </Tooltip>
        );
      })}
    </Box>
  );
}
