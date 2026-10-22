import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { analyzeTrip } from '../api/client';
import type { TripInput } from '../api/types';

export function useAnalyzeTrip() {
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  return useMutation({
    mutationFn: (input: TripInput) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      return analyzeTrip(input, controller.signal);
    },
  });
}
