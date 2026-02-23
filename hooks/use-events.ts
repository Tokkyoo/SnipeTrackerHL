import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

export interface FeedEvent {
  id: string;
  traderName: string;
  traderAddress: string;
  market: string;
  side: string;
  qty: number;
  notionalUsd: number;
  createdAt: string;
}

export function useEvents(refreshInterval = 5000) {
  const { data, error, isLoading, mutate } = useSWR<FeedEvent[]>(
    '/api/events?limit=200',
    fetcher,
    {
      refreshInterval,
      refreshWhenHidden: true,
      dedupingInterval: 2000,
    }
  );

  return {
    events: data || [],
    error,
    isLoading,
    refresh: mutate,
  };
}
