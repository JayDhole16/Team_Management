import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/errors';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retry network/server hiccups, never 4xx answers (they will not change).
        retry: (count, err) =>
          count < 2 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
        staleTime: 10_000,
      },
      mutations: { retry: false },
    },
  });
}
