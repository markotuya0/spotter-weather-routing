export function localDateTimeToIsoWithOffset(localValue: string): string {
  const date = new Date(localValue);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0');
  const offsetHours = pad(offsetMinutes / 60);
  const offsetMins = pad(offsetMinutes % 60);

  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${sign}${offsetHours}:${offsetMins}`;
}
