import { FeedEvent } from '../server/dashboardServer';

/**
 * Market Pulse data for a single asset
 */
export interface MarketPulseRow {
  market: string;
  longPct: number;
  shortPct: number;
  totalTrades: number;
  totalNotionalUsd: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

/**
 * Compute market pulse from recent trade events
 * @param events - All feed events
 * @param windowMs - Time window in milliseconds (default: 5 minutes)
 * @param weighted - Whether to weight by notional USD (default: false)
 * @returns Array of market pulse data per asset
 */
export function computeMarketPulse(
  events: FeedEvent[],
  windowMs: number = 5 * 60 * 1000,
  weighted: boolean = false
): MarketPulseRow[] {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Filter events within time window
  const recentEvents = events.filter(e => e.ts >= cutoff);

  // Group by market
  const marketMap = new Map<string, {
    longCount: number;
    shortCount: number;
    longNotional: number;
    shortNotional: number;
  }>();

  for (const event of recentEvents) {
    const market = event.market.split('-')[0]; // Extract base asset (e.g., "ETH" from "ETH-USD")
    
    if (!marketMap.has(market)) {
      marketMap.set(market, {
        longCount: 0,
        shortCount: 0,
        longNotional: 0,
        shortNotional: 0
      });
    }

    const data = marketMap.get(market)!;
    
    if (event.side === 'buy') {
      data.longCount++;
      data.longNotional += event.notionalUsd;
    } else {
      data.shortCount++;
      data.shortNotional += event.notionalUsd;
    }
  }

  // Compute percentages and sentiment
  const results: MarketPulseRow[] = [];

  for (const [market, data] of marketMap.entries()) {
    const totalTrades = data.longCount + data.shortCount;
    const totalNotionalUsd = data.longNotional + data.shortNotional;

    let longPct: number;
    let shortPct: number;

    if (weighted && totalNotionalUsd > 0) {
      // Weighted by notional USD
      longPct = (data.longNotional / totalNotionalUsd) * 100;
      shortPct = (data.shortNotional / totalNotionalUsd) * 100;
    } else {
      // Simple count
      longPct = totalTrades > 0 ? (data.longCount / totalTrades) * 100 : 0;
      shortPct = totalTrades > 0 ? (data.shortCount / totalTrades) * 100 : 0;
    }

    // Determine sentiment
    let sentiment: 'bullish' | 'bearish' | 'neutral';
    if (longPct >= 65) {
      sentiment = 'bullish';
    } else if (shortPct >= 65) {
      sentiment = 'bearish';
    } else {
      sentiment = 'neutral';
    }

    results.push({
      market,
      longPct: Math.round(longPct * 10) / 10, // Round to 1 decimal
      shortPct: Math.round(shortPct * 10) / 10,
      totalTrades,
      totalNotionalUsd: Math.round(totalNotionalUsd * 100) / 100,
      sentiment
    });
  }

  // Sort by total notional USD (descending)
  results.sort((a, b) => b.totalNotionalUsd - a.totalNotionalUsd);

  return results;
}

/**
 * Format market pulse for display
 */
export function formatMarketPulse(pulse: MarketPulseRow): string {
  const arrow = pulse.sentiment === 'bullish' ? '↑' : pulse.sentiment === 'bearish' ? '↓' : '→';
  const mainPct = pulse.sentiment === 'bullish' ? pulse.longPct : pulse.shortPct;
  const label = pulse.sentiment === 'bullish' ? 'LONG' : pulse.sentiment === 'bearish' ? 'SHORT' : 'MIXED';
  
  return `${pulse.market} ${arrow} ${mainPct}% ${label}`;
}
