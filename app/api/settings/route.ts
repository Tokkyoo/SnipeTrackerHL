import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth-helpers';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  let settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
  });

  if (!settings) {
    settings = await prisma.userSettings.create({
      data: { userId: user.id },
    });
  }

  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await request.json();

  const settings = await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {
      ratio: body.ratio,
      notionalCap: body.notionalCap,
      maxLeverage: body.maxLeverage,
      maxTotalNotional: body.maxTotalNotional,
      copyMode: body.copyMode,
      tif: body.tif,
      cooldownMs: body.cooldownMs,
    },
    create: {
      userId: user.id,
      ratio: body.ratio,
      notionalCap: body.notionalCap,
      maxLeverage: body.maxLeverage,
      maxTotalNotional: body.maxTotalNotional,
      copyMode: body.copyMode,
      tif: body.tif,
      cooldownMs: body.cooldownMs,
    },
  });

  return NextResponse.json(settings);
}
