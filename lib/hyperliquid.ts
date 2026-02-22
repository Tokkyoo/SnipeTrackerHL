const HL_API = 'https://api.hyperliquid.xyz/info';

export interface Position {
  coin: string;
  size: number;
  entryPx: number;
  positionValue: number;
  leverage: number;
  unrealizedPnl: number;
  marginUsed: number;
  liquidationPx: number;
  returnOnEquity: number;
}

export interface AccountSummary {
  equity: number;
  totalMarginUsed: number;
  totalNotional: number;
}

async function hlPost(body: Record<string, unknown>) {
  const res = await fetch(HL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Hyperliquid API error: ${res.status}`);
  }

  return res.json();
}

export async function getPositions(address: string): Promise<Position[]> {
  try {
    const data = await hlPost({ type: 'clearinghouseState', user: address });

    if (!data.assetPositions || !Array.isArray(data.assetPositions)) {
      return [];
    }

    return data.assetPositions
      .filter((ap: any) => ap.position && Math.abs(parseFloat(ap.position.szi)) > 0)
      .map((ap: any) => ({
        coin: ap.position.coin,
        size: parseFloat(ap.position.szi),
        entryPx: parseFloat(ap.position.entryPx || '0'),
        positionValue: parseFloat(ap.position.positionValue || '0'),
        leverage: parseFloat(ap.position.leverage?.value || '0'),
        unrealizedPnl: parseFloat(ap.position.unrealizedPnl || '0'),
        marginUsed: parseFloat(ap.position.marginUsed || '0'),
        liquidationPx: parseFloat(ap.position.liquidationPx || '0'),
        returnOnEquity: parseFloat(ap.position.returnOnEquity || '0'),
      }));
  } catch (error) {
    console.error(`Failed to fetch positions for ${address}:`, error);
    return [];
  }
}

export async function getAccountSummary(address: string): Promise<AccountSummary> {
  try {
    const data = await hlPost({ type: 'clearinghouseState', user: address });

    return {
      equity: parseFloat(data.marginSummary?.accountValue || '0'),
      totalMarginUsed: parseFloat(data.marginSummary?.totalMarginUsed || '0'),
      totalNotional: parseFloat(data.marginSummary?.totalNtlPos || '0'),
    };
  } catch (error) {
    console.error(`Failed to fetch account summary for ${address}:`, error);
    return { equity: 0, totalMarginUsed: 0, totalNotional: 0 };
  }
}
