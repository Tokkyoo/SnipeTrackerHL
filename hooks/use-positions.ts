import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';

interface Position {
  coin: string;
  size: number;
  entryPx: number;
  positionValue: number;
  leverage: number;
  unrealizedPnl: number;
  returnOnEquity: number;
}

interface WalletPositions {
  walletId: string;
  address: string;
  nickname: string | null;
  positions: Position[];
}

export function usePositions(refreshInterval = 3000) {
  const { data, error, isLoading, mutate } = useSWR<WalletPositions[]>(
    '/api/positions',
    fetcher,
    {
      refreshInterval,
      refreshWhenHidden: true,
      dedupingInterval: 1000,
    }
  );

  // Flatten all positions across all wallets
  const allPositions: (Position & { traderName: string; traderAddress: string })[] = [];
  if (data) {
    for (const wallet of data) {
      for (const pos of wallet.positions) {
        allPositions.push({
          ...pos,
          traderName: wallet.nickname || `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`,
          traderAddress: wallet.address,
        });
      }
    }
  }

  return {
    walletPositions: data || [],
    allPositions,
    error,
    isLoading,
    refresh: mutate,
    isLive: !error && !isLoading,
  };
}
