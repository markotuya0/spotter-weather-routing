import { describe, expect, it } from 'vitest';
import { describeBlockedReason, describeIncompleteReason } from './eligibilityReason';

describe('describeBlockedReason', () => {
  it('turns a mile-coded reason into plain language', () => {
    expect(describeBlockedReason('no_travel_at_mile_142')).toBe('No Travel near mile 142');
  });

  it('falls back to a generic message for an unrecognized or missing reason', () => {
    expect(describeBlockedReason(null)).toBe('No Travel conditions on this route');
    expect(describeBlockedReason('something_unexpected')).toBe('No Travel conditions on this route');
  });
});

describe('describeIncompleteReason', () => {
  it('pluralizes the checkpoint count', () => {
    expect(describeIncompleteReason('unknown_at_3_checkpoints')).toBe('Incomplete weather data at 3 checkpoints');
    expect(describeIncompleteReason('unknown_at_1_checkpoint')).toBe('Incomplete weather data at 1 checkpoint');
  });

  it('falls back to a generic message for an unrecognized or missing reason', () => {
    expect(describeIncompleteReason(null)).toBe('Incomplete weather data for this route');
  });
});
