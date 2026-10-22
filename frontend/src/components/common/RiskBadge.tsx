import Chip from '@mui/material/Chip';
import type { RiskLevel } from '../../api/types';
import { RISK_STYLES } from '../../theme/riskColors';

export function RiskBadge({ level, size = 'medium' }: { level: RiskLevel; size?: 'small' | 'medium' }) {
  const style = RISK_STYLES[level];
  return (
    <Chip
      size={size}
      label={`${style.glyph} ${style.label}`}
      sx={{
        fontWeight: 600,
        color: level === 'no_travel' ? '#FFFFFF' : style.color,
        backgroundColor: level === 'no_travel' ? style.color : `${style.color}1A`,
        border: `1px solid ${style.color}`,
      }}
    />
  );
}
