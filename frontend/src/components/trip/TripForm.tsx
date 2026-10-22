import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useRef, useState, type FormEvent } from 'react';
import type { CheckpointIntervalMiles, TripInput } from '../../api/types';
import { tokens } from '../../theme/theme';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { localDateTimeToIsoWithOffset } from './datetime';
import {
  DEFAULT_TRIP_FORM_VALUES,
  type FieldErrors,
  type TripFormValues,
  validateTripForm,
} from './validation';

interface TripFormProps {
  onSubmit: (input: TripInput) => void;
  isSubmitting: boolean;
  initialValues?: TripFormValues;
}

const FIELD_ORDER: (keyof FieldErrors)[] = [
  'origin',
  'destination',
  'departureTime',
  'loadWeightLb',
  'checkpointIntervalMiles',
];

export function TripForm({ onSubmit, isSubmitting, initialValues }: TripFormProps) {
  const [values, setValues] = useState<TripFormValues>(initialValues ?? DEFAULT_TRIP_FORM_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const fieldRefs = useRef<Partial<Record<keyof FieldErrors, HTMLElement | null>>>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const fieldErrors = validateTripForm(values);
    setErrors(fieldErrors);

    if (Object.keys(fieldErrors).length > 0) {
      const firstInvalid = FIELD_ORDER.find((field) => fieldErrors[field]);
      if (firstInvalid) fieldRefs.current[firstInvalid]?.focus();
      return;
    }

    const input: TripInput = {
      origin: { label: values.origin.label, lat: values.origin.lat!, lng: values.origin.lng! },
      destination: {
        label: values.destination.label,
        lat: values.destination.lat!,
        lng: values.destination.lng!,
      },
      departure_time: localDateTimeToIsoWithOffset(values.departureTime),
      load_weight_lb: Number(values.loadWeightLb),
      checkpoint_interval_miles: values.checkpointIntervalMiles,
    };
    onSubmit(input);
  }

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={2} noValidate aria-label="Trip details">
      <div
        ref={(el) => {
          fieldRefs.current.origin = el?.querySelector('input') ?? null;
        }}
      >
        <PlaceAutocomplete
          label="Origin"
          placeholder="e.g. Denver, CO"
          value={values.origin}
          onChange={(origin) => setValues((prev) => ({ ...prev, origin }))}
          error={errors.origin}
        />
      </div>

      <div
        ref={(el) => {
          fieldRefs.current.destination = el?.querySelector('input') ?? null;
        }}
      >
        <PlaceAutocomplete
          label="Destination"
          placeholder="e.g. Omaha, NE"
          value={values.destination}
          onChange={(destination) => setValues((prev) => ({ ...prev, destination }))}
          error={errors.destination}
        />
      </div>

      <TextField
        inputRef={(el) => (fieldRefs.current.departureTime = el)}
        label="Departure date and time"
        type="datetime-local"
        value={values.departureTime}
        onChange={(event) => setValues((prev) => ({ ...prev, departureTime: event.target.value }))}
        error={Boolean(errors.departureTime)}
        helperText={errors.departureTime}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <TextField
        inputRef={(el) => (fieldRefs.current.loadWeightLb = el)}
        label="Load weight"
        type="number"
        inputMode="decimal"
        placeholder="e.g. 38000"
        value={values.loadWeightLb}
        onChange={(event) => setValues((prev) => ({ ...prev, loadWeightLb: event.target.value }))}
        error={Boolean(errors.loadWeightLb)}
        helperText={
          errors.loadWeightLb ??
          'Load weight changes risk at 30,000 lb, 40,000 lb and above thresholds.'
        }
        slotProps={{
          inputLabel: { shrink: true },
          input: { endAdornment: <InputAdornment position="end">lb</InputAdornment> },
        }}
      />

      <Stack spacing={1}>
        <Typography component="label" id="checkpoint-spacing-label" variant="body2" sx={{ fontWeight: 600 }}>
          Checkpoint spacing
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={values.checkpointIntervalMiles}
          onChange={(_event, next: CheckpointIntervalMiles | null) => {
            if (next !== null) setValues((prev) => ({ ...prev, checkpointIntervalMiles: next }));
          }}
          aria-labelledby="checkpoint-spacing-label"
        >
          {[10, 25, 50].map((miles) => (
            <ToggleButton
              key={miles}
              value={miles}
              // Explicit colours: MUI's default selected/unselected text pairs fail WCAG AA contrast.
              sx={{
                color: tokens.ink,
                '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: tokens.brand, color: '#FFFFFF' },
                '&:focus-visible': { outline: '2px solid', outlineColor: tokens.brand, outlineOffset: 2 },
              }}
            >
              {miles} mi
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Button
        type="submit"
        variant="contained"
        size="large"
        disabled={isSubmitting}
        startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : undefined}
      >
        {isSubmitting ? 'Analyzing…' : 'Analyze trip'}
      </Button>
    </Stack>
  );
}
