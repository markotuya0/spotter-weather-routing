// Turns the backend's machine-readable eligibility.reason (docs/04-api-contracts.md §4,
// e.g. "no_travel_at_mile_142", "unknown_at_3_checkpoints") into the UI copy from
// docs/06-ui-ux-spec.md §4, instead of showing the raw token to the user.
export function describeBlockedReason(reason: string | null): string {
  const mileMatch = reason?.match(/^no_travel_at_mile_(\d+)$/);
  if (mileMatch) return `No Travel near mile ${mileMatch[1]}`;
  return 'No Travel conditions on this route';
}

export function describeIncompleteReason(reason: string | null): string {
  const countMatch = reason?.match(/^unknown_at_(\d+)_checkpoints?$/);
  if (countMatch) {
    const count = Number(countMatch[1]);
    return `Incomplete weather data at ${count} checkpoint${count === 1 ? '' : 's'}`;
  }
  return 'Incomplete weather data for this route';
}
