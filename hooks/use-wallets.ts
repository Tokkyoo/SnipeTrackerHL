import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

interface TrackedWallet {
  id: string;
  address: string;
  nickname: string | null;
  createdAt: string;
}

export function useWallets() {
  const { data, error, isLoading, mutate } = useSWR<TrackedWallet[]>(
    '/api/wallets',
    fetcher
  );

  const addWallet = async (address: string, nickname?: string) => {
    const res = await fetch('/api/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, nickname }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to add wallet');
    }

    await mutate();
    return res.json();
  };

  const removeWallet = async (id: string) => {
    const res = await fetch(`/api/wallets/${id}`, { method: 'DELETE' });

    if (!res.ok) {
      throw new Error('Failed to remove wallet');
    }

    await mutate();
  };

  const updateNickname = async (id: string, nickname: string) => {
    const res = await fetch(`/api/wallets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname }),
    });

    if (!res.ok) {
      throw new Error('Failed to update nickname');
    }

    await mutate();
  };

  return {
    wallets: data || [],
    error,
    isLoading,
    addWallet,
    removeWallet,
    updateNickname,
    refresh: mutate,
  };
}
