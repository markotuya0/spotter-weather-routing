import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { usePlaceSuggest } from '../../hooks/usePlaceSuggest';
import type { PlaceSuggestion } from '../../api/types';
import type { PlaceValue } from './validation';

interface PlaceAutocompleteProps {
  label: string;
  value: PlaceValue;
  onChange: (value: PlaceValue) => void;
  error?: string;
  placeholder?: string;
}

export function PlaceAutocomplete({ label, value, onChange, error, placeholder }: PlaceAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value.label);
  const { data, isFetching, isError } = usePlaceSuggest(inputValue);
  const options = data?.results ?? [];

  return (
    <Autocomplete<PlaceSuggestion, false, false, true>
      freeSolo
      filterOptions={(opts) => opts}
      options={options}
      loading={isFetching}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.label)}
      isOptionEqualToValue={(option, selected) =>
        typeof option !== 'string' && typeof selected !== 'string' && option.id === selected.id
      }
      inputValue={inputValue}
      onInputChange={(_event, newInputValue) => {
        setInputValue(newInputValue);
        if (newInputValue !== value.label) {
          onChange({ label: newInputValue, lat: null, lng: null });
        }
      }}
      onChange={(_event, selected) => {
        if (selected && typeof selected !== 'string') {
          onChange({ label: selected.label, lat: selected.lat, lng: selected.lng });
          setInputValue(selected.label);
        }
      }}
      renderInput={({ slotProps, ...params }) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          error={Boolean(error)}
          helperText={
            error ?? (isError ? "Couldn't search places. Press Enter to try the typed text." : undefined)
          }
          slotProps={{
            ...slotProps,
            inputLabel: { ...slotProps.inputLabel, shrink: true },
            input: {
              ...slotProps.input,
              endAdornment: (
                <>
                  {isFetching ? <CircularProgress color="inherit" size={18} /> : null}
                  {slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
      noOptionsText={inputValue.trim().length < 3 ? 'Type at least 3 characters' : 'No matches'}
    />
  );
}
