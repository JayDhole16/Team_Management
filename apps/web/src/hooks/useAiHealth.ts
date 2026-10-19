import { useQuery } from '@tanstack/react-query';
import { fetchAiHealth } from '../api/ai';

/** Is the AI assistant usable right now? Pages show "AI offline" and offer manual entry. */
export function useAiHealth() {
  return useQuery({
    queryKey: ['ai-health'],
    queryFn: fetchAiHealth,
    refetchInterval: 30_000,
    retry: false,
  });
}
