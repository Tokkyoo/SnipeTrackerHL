import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPositions } from '@/lib/hyperliquid';

// Secure the cron endpoint with a secret
function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  // Allow Vercel Cron (sends this header)
  if (req.headers.get('x-vercel-cron')) return true;
  // Allow in development
  if (process.env.NODE_ENV === 'development') return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all tracked wallets grouped by user
    const wallets = await prisma.trackedWallet.findMany({
      include: { snapshots: true },
    });

    if (wallets.length === 0) {
      return NextResponse.json({ message: 'No wallets to poll', events: 0 });
    }

    let totalEvents = 0;

    // Process each wallet
    for (const wallet of wallets) {
      const positions = await getPositions(wallet.address);
      const traderName = wallet.nickname || `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;

      // Build map of current positions
      const currentMap = new Map<string, { size: number; entryPx: number; positionValue: number }>();
      for (const pos of positions) {
        currentMap.set(pos.coin, {
          size: pos.size,
          entryPx: pos.entryPx,
          positionValue: pos.positionValue,
        });
      }

      // Build map of previous snapshots
      const prevMap = new Map<string, { coin: string; size: number; entryPx: number; positionValue: number }>();
      for (const snap of wallet.snapshots) {
        prevMap.set(snap.coin, {
          coin: snap.coin,
          size: snap.size,
          entryPx: snap.entryPx,
          positionValue: snap.positionValue,
        });
      }

      const newEvents: {
        userId: string;
        traderName: string;
        traderAddress: string;
        market: string;
        side: string;
        qty: number;
        notionalUsd: number;
      }[] = [];

      // Detect new or changed positions
      for (const [coin, pos] of currentMap) {
        const prev = prevMap.get(coin);
        if (!prev) {
          // New position opened
          newEvents.push({
            userId: wallet.userId,
            traderName,
            traderAddress: wallet.address,
            market: `${coin}-PERP`,
            side: pos.size > 0 ? 'buy' : 'sell',
            qty: Math.abs(pos.size),
            notionalUsd: Math.abs(pos.positionValue),
          });
        } else if (Math.abs(pos.size - prev.size) > 0.0001) {
          // Position size changed
          const sizeChange = pos.size - prev.size;
          newEvents.push({
            userId: wallet.userId,
            traderName,
            traderAddress: wallet.address,
            market: `${coin}-PERP`,
            side: sizeChange > 0 ? 'buy' : 'sell',
            qty: Math.abs(sizeChange),
            notionalUsd: Math.abs(sizeChange * pos.entryPx),
          });
        }
      }

      // Detect closed positions
      for (const [coin, prev] of prevMap) {
        if (!currentMap.has(coin)) {
          newEvents.push({
            userId: wallet.userId,
            traderName,
            traderAddress: wallet.address,
            market: `${coin}-PERP`,
            side: prev.size > 0 ? 'sell' : 'buy',
            qty: Math.abs(prev.size),
            notionalUsd: Math.abs(prev.positionValue),
          });
        }
      }

      // Save events to DB
      if (newEvents.length > 0) {
        await prisma.feedEvent.createMany({ data: newEvents });
        totalEvents += newEvents.length;
      }

      // Upsert position snapshots
      for (const [coin, pos] of currentMap) {
        await prisma.positionSnapshot.upsert({
          where: {
            walletId_coin: { walletId: wallet.id, coin },
          },
          create: {
            walletId: wallet.id,
            coin,
            size: pos.size,
            entryPx: pos.entryPx,
            positionValue: pos.positionValue,
          },
          update: {
            size: pos.size,
            entryPx: pos.entryPx,
            positionValue: pos.positionValue,
          },
        });
      }

      // Delete snapshots for closed positions
      const closedCoins = [...prevMap.keys()].filter(coin => !currentMap.has(coin));
      if (closedCoins.length > 0) {
        await prisma.positionSnapshot.deleteMany({
          where: {
            walletId: wallet.id,
            coin: { in: closedCoins },
          },
        });
      }
    }

    return NextResponse.json({
      message: `Polled ${wallets.length} wallets`,
      events: totalEvents,
    });
  } catch (error) {
    console.error('Cron poll error:', error);
    return NextResponse.json({ error: 'Poll failed' }, { status: 500 });
  }
}
