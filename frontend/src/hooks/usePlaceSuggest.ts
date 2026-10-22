import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { suggestPlaces } from '../api/client';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

export function usePlaceSuggest(query: string) {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const trimmed = debounced.trim();

  return useQuery({
    queryKey: ['places-suggest', trimmed],
    queryFn: ({ signal }) => suggestPlaces(trimmed, signal),
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 5 * 60 * 1000,
  });
}
