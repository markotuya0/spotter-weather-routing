import type { CheckpointIntervalMiles } from '../../api/types';

export interface PlaceValue {
  label: string;
  lat: number | null;
  lng: number | null;
}

export interface TripFormValues {
  origin: PlaceValue;
  destination: PlaceValue;
  departureTime: string; // datetime-local value, naive local string
  loadWeightLb: string;
  checkpointIntervalMiles: CheckpointIntervalMiles;
}

export type FieldErrors = Partial<Record<keyof TripFormValues | 'origin' | 'destination', string>>;

const MIN_LOAD_LB = 1;
const MAX_LOAD_LB = 100_000;
const MIN_APART_MILES = 1;
const MAX_DAYS_AHEAD = 7;

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function validateTripForm(values: TripFormValues, now: Date = new Date()): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.origin.label.trim() || values.origin.lat === null || values.origin.lng === null) {
    errors.origin = 'Choose an origin from the suggestions.';
  }
  if (!values.destination.label.trim() || values.destination.lat === null || values.destination.lng === null) {
    errors.destination = 'Choose a destination from the suggestions.';
  }
  if (
    !errors.origin &&
    !errors.destination &&
    values.origin.lat !== null &&
    values.origin.lng !== null &&
    values.destination.lat !== null &&
    values.destination.lng !== null
  ) {
    const distance = haversineMiles(
      { lat: values.origin.lat, lng: values.origin.lng },
      { lat: values.destination.lat, lng: values.destination.lng },
    );
    if (distance <= MIN_APART_MILES) {
      errors.destination = 'Origin and destination must be more than 1 mile apart.';
    }
  }

  if (!values.departureTime) {
    errors.departureTime = 'Choose a departure date and time.';
  } else {
    const departure = new Date(values.departureTime);
    const earliest = new Date(now.getTime() - 60 * 60 * 1000);
    const latest = new Date(now.getTime() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000);
    if (Number.isNaN(departure.getTime())) {
      errors.departureTime = 'Enter a valid date and time.';
    } else if (departure < earliest || departure > latest) {
      errors.departureTime = `Departure must be within ${MAX_DAYS_AHEAD} days from now.`;
    }
  }

  const loadWeight = Number(values.loadWeightLb);
  if (values.loadWeightLb.trim() === '' || Number.isNaN(loadWeight)) {
    errors.loadWeightLb = 'Enter the load weight in pounds.';
  } else if (loadWeight < MIN_LOAD_LB || loadWeight > MAX_LOAD_LB) {
    errors.loadWeightLb = `Must be between ${MIN_LOAD_LB} and ${MAX_LOAD_LB}.`;
  }

  if (![10, 25, 50].includes(values.checkpointIntervalMiles)) {
    errors.checkpointIntervalMiles = 'Choose a checkpoint spacing.';
  }

  return errors;
}

export const EMPTY_PLACE: PlaceValue = { label: '', lat: null, lng: null };

export const DEFAULT_TRIP_FORM_VALUES: TripFormValues = {
  origin: EMPTY_PLACE,
  destination: EMPTY_PLACE,
  departureTime: '',
  loadWeightLb: '',
  checkpointIntervalMiles: 25,
};
