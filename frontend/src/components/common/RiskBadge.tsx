import Chip from '@mui/material/Chip';
import type { RiskLevel } from '../../api/types';
import { tokens } from '../../theme/theme';
import { RISK_STYLES } from '../../theme/riskColors';

export function RiskBadge({ level, size = 'medium' }: { level: RiskLevel; size?: 'small' | 'medium' }) {
  const style = RISK_STYLES[level];
  return (
    <Chip
      size={size}
      label={`${style.glyph} ${style.label}`}
      sx={{
        fontWeight: 600,
        // Label text uses the ink token for contrast (moderate/high risk colours fail AA as text).
        // Severity is still conveyed by the glyph, the text label and the coloured border/fill.
        color: level === 'no_travel' ? '#FFFFFF' : tokens.ink,
        backgroundColor: level === 'no_travel' ? style.color : `${style.color}1A`,
        border: `1px solid ${style.color}`,
      }}
    />
  );
}
