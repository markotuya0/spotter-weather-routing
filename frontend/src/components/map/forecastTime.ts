/** Forecast horizon in hours: `heatmap.hours` is 49 (h = 0..48). docs/05 §10, docs/02 §2.5. */
export const FORECAST_MAX_HOUR = 48;

/**
 * Clamps a requested hour into the valid frame range. Non-finite values fall back to hour 0 (the
 * departure frame), so a bad value can never index outside `heatmap.points[].risk`.
 */
export function clampHour(hour: number, maxHour: number = FORECAST_MAX_HOUR): number {
  if (!Number.isFinite(hour)) return 0;
  return Math.min(Math.max(Math.round(hour), 0), maxHour);
}

/** Absolute UTC instant for forecast hour `hour`. API times are UTC (docs/05 §1, A-10). */
export function forecastInstant(startIso: string, hour: number): Date {
  return new Date(Date.parse(startIso) + hour * 3_600_000);
}

const formatterCache = new Map<string | undefined, Intl.DateTimeFormat>();

// Formatters are cached per zone: the slider calls this on every step, and building one is costly.
function forecastFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone,
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Human label for a forecast frame in the viewer's local zone, e.g. "Fri, Oct 23, 2:00 AM MDT · +6 h".
 * Local date is shown explicitly so a frame that crosses midnight reads as the next day.
 * `timeZone` is optional and defaults to the browser zone (docs/05 A-10); tests pass it explicitly.
 */
export function formatForecastLabel(startIso: string, hour: number, timeZone?: string): string {
  const when = forecastFormatter(timeZone).format(forecastInstant(startIso, hour));
  return `${when} · +${hour} h`;
}
