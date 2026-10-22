import type { RiskLevel } from '../api/types';

export interface RiskStyle {
  color: string;
  label: string;
  glyph: string;
}

export const RISK_STYLES: Record<RiskLevel, RiskStyle> = {
  low: { color: '#2E8B57', label: 'Low', glyph: '●' },
  moderate: { color: '#E3AE00', label: 'Moderate', glyph: '■' },
  high: { color: '#EB6F0A', label: 'High', glyph: '▲' },
  severe: { color: '#C62828', label: 'Severe', glyph: '◆' },
  no_travel: { color: '#2A1245', label: 'No travel', glyph: '✕' },
  unknown: { color: '#8796A1', label: 'Unknown', glyph: '?' },
};

export const RISK_ORDER: RiskLevel[] = ['low', 'moderate', 'high', 'severe', 'no_travel'];
