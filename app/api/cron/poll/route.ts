import { NextRequest, NextResponse } from 'next/server';
import { pollAndDiffWallets } from '@/lib/poll-positions';

export async function GET(req: NextRequest) {
  // Verify Vercel Cron or CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron');
  const isDev = process.env.NODE_ENV === 'development';

  if (!isDev && !isVercelCron && !(cronSecret && authHeader === `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const totalEvents = await pollAndDiffWallets();
    return NextResponse.json({ ok: true, events: totalEvents });
  } catch (error) {
    console.error('Cron poll error:', error);
    return NextResponse.json({ error: 'Poll failed' }, { status: 500 });
  }
}
