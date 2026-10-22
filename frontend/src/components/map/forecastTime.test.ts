import { describe, expect, it } from 'vitest';
import { clampHour, forecastInstant, formatForecastLabel } from './forecastTime';

const START = '2026-10-22T20:00:00Z';

describe('forecastInstant', () => {
  it.each([
    [0, '2026-10-22T20:00:00.000Z'],
    [24, '2026-10-23T20:00:00.000Z'],
    [48, '2026-10-24T20:00:00.000Z'],
  ])('hour %i is %s', (hour, iso) => {
    expect(forecastInstant(START, hour).toISOString()).toBe(iso);
  });

  it('crosses midnight UTC without losing the hour', () => {
    expect(forecastInstant(START, 6).toISOString()).toBe('2026-10-23T02:00:00.000Z');
  });
});

describe('formatForecastLabel', () => {
  it('labels hour 0 as the departure frame in the chosen zone', () => {
    const label = formatForecastLabel(START, 0, 'UTC');
    expect(label).toContain('Thu');
    expect(label).toContain('Oct 22');
    expect(label).toContain('8:00 PM');
    expect(label.endsWith('· +0 h')).toBe(true);
  });

  it('rolls the local date over at midnight', () => {
    // 20:00Z + 6 h = 02:00Z on Oct 23 — still Oct 22 in Denver (MDT, UTC-6), so the date changes there
    expect(formatForecastLabel(START, 6, 'UTC')).toContain('Oct 23');
    expect(formatForecastLabel(START, 6, 'UTC')).toContain('2:00 AM');
    expect(formatForecastLabel(START, 6, 'America/Denver')).toContain('Oct 22');
    expect(formatForecastLabel(START, 6, 'America/Denver')).toContain('8:00 PM');
  });

  it('labels hour 24 and hour 48 on the correct later days', () => {
    expect(formatForecastLabel(START, 24, 'UTC')).toContain('Fri');
    expect(formatForecastLabel(START, 24, 'UTC')).toContain('· +24 h');
    expect(formatForecastLabel(START, 48, 'UTC')).toContain('Sat');
    expect(formatForecastLabel(START, 48, 'UTC')).toContain('· +48 h');
  });
});

describe('clampHour', () => {
  it('keeps valid hours and clamps to 0..48', () => {
    expect(clampHour(0)).toBe(0);
    expect(clampHour(24)).toBe(24);
    expect(clampHour(48)).toBe(48);
    expect(clampHour(-3)).toBe(0);
    expect(clampHour(60)).toBe(48);
  });

  it('rounds fractional input and falls back to 0 for non-finite input', () => {
    expect(clampHour(6.4)).toBe(6);
    expect(clampHour(Number.NaN)).toBe(0);
    expect(clampHour(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
