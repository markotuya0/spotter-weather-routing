import { describe, expect, it } from 'vitest';
import { DEFAULT_TRIP_FORM_VALUES, validateTripForm, type TripFormValues } from './validation';

const NOW = new Date('2026-10-22T12:00:00Z');

function values(overrides: Partial<TripFormValues> = {}): TripFormValues {
  return {
    ...DEFAULT_TRIP_FORM_VALUES,
    origin: { label: 'Denver, CO', lat: 39.7392, lng: -104.9903 },
    destination: { label: 'Omaha, NE', lat: 41.2565, lng: -95.9345 },
    departureTime: '2026-10-22T14:00',
    loadWeightLb: '38000',
    checkpointIntervalMiles: 25,
    ...overrides,
  };
}

describe('validateTripForm', () => {
  it('passes for a fully valid trip', () => {
    expect(validateTripForm(values(), NOW)).toEqual({});
  });

  it('requires an origin selected from suggestions', () => {
    const errors = validateTripForm(values({ origin: { label: '', lat: null, lng: null } }), NOW);
    expect(errors.origin).toMatch(/origin/i);
  });

  it('requires an origin and destination to be more than 1 mile apart', () => {
    const errors = validateTripForm(
      values({ destination: { label: 'Denver, CO', lat: 39.7392, lng: -104.9903 } }),
      NOW,
    );
    expect(errors.destination).toMatch(/1 mile/);
  });

  it('rejects a departure time more than 7 days ahead', () => {
    const errors = validateTripForm(values({ departureTime: '2026-11-05T14:00' }), NOW);
    expect(errors.departureTime).toMatch(/7 days/);
  });

  it('rejects a departure time more than 1 hour in the past', () => {
    const errors = validateTripForm(values({ departureTime: '2026-10-22T10:00' }), NOW);
    expect(errors.departureTime).toBeDefined();
  });

  it('rejects a load weight outside 1..100000', () => {
    expect(validateTripForm(values({ loadWeightLb: '0' }), NOW).loadWeightLb).toMatch(
      /Must be between 1 and 100000/,
    );
    expect(validateTripForm(values({ loadWeightLb: '100001' }), NOW).loadWeightLb).toMatch(
      /Must be between 1 and 100000/,
    );
  });

  it('requires a numeric load weight', () => {
    expect(validateTripForm(values({ loadWeightLb: '' }), NOW).loadWeightLb).toBeDefined();
    expect(validateTripForm(values({ loadWeightLb: 'abc' }), NOW).loadWeightLb).toBeDefined();
  });
});
