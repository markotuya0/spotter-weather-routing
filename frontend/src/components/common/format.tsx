export function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

export function Miles({ value }: { value: number }) {
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMiles(value)}</span>;
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

export function Duration({ seconds }: { seconds: number }) {
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDuration(seconds)}</span>;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function TimeText({ iso }: { iso: string }) {
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(iso)}</span>;
}

export function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(start);
  const endLabel = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(end);
  return `${startLabel}–${endLabel}`;
}
