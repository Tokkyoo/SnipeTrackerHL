import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth-helpers';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const wallets = await prisma.trackedWallet.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(wallets);
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { address, nickname } = await request.json();

  if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
    return NextResponse.json(
      { error: 'Valid Ethereum address required' },
      { status: 400 }
    );
  }

  const existing = await prisma.trackedWallet.findUnique({
    where: { userId_address: { userId: user.id, address: address.toLowerCase() } },
  });

  if (existing) {
    return NextResponse.json(
      { error: 'Wallet already tracked' },
      { status: 409 }
    );
  }

  const wallet = await prisma.trackedWallet.create({
    data: {
      userId: user.id,
      address: address.toLowerCase(),
      nickname: nickname || null,
    },
  });

  return NextResponse.json(wallet, { status: 201 });
}
