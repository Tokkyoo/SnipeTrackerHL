import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth-helpers';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { nickname } = await request.json();

  const wallet = await prisma.trackedWallet.findFirst({
    where: { id, userId: user.id },
  });

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
  }

  const updated = await prisma.trackedWallet.update({
    where: { id },
    data: { nickname },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const wallet = await prisma.trackedWallet.findFirst({
    where: { id, userId: user.id },
  });

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
  }

  await prisma.trackedWallet.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
