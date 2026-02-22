import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

interface UserSettings {
  id: string;
  userId: string;
  ratio: number;
  notionalCap: number;
  maxLeverage: number;
  maxTotalNotional: number;
  copyMode: string;
  tif: string;
  cooldownMs: number;
}

export function useSettings() {
  const { data, error, isLoading, mutate } = useSWR<UserSettings>(
    '/api/settings',
    fetcher
  );

  const updateSettings = async (settings: Partial<UserSettings>) => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });

    if (!res.ok) {
      throw new Error('Failed to update settings');
    }

    await mutate();
    return res.json();
  };

  return {
    settings: data,
    error,
    isLoading,
    updateSettings,
    refresh: mutate,
  };
}
