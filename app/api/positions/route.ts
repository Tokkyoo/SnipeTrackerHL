import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth-helpers';
import { getPositions, type Position } from '@/lib/hyperliquid';
import { pollAndDiffWallets } from '@/lib/poll-positions';

export interface WalletPositions {
  walletId: string;
  address: string;
  nickname: string | null;
  positions: Position[];
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const wallets = await prisma.trackedWallet.findMany({
    where: { userId: user.id },
  });

  if (wallets.length === 0) {
    return NextResponse.json([]);
  }

  // Trigger server-side diffing and event generation (fire-and-forget)
  const walletIds = wallets.map(w => w.id);
  pollAndDiffWallets(walletIds).catch(err =>
    console.error('Background diff error:', err)
  );

  // Return positions to the client
  const results: WalletPositions[] = await Promise.all(
    wallets.map(async (wallet) => {
      const positions = await getPositions(wallet.address);
      return {
        walletId: wallet.id,
        address: wallet.address,
        nickname: wallet.nickname,
        positions,
      };
    })
  );

  return NextResponse.json(results);
}
