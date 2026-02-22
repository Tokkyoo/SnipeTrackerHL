import axios from 'axios';
import { logger } from '../utils/logger';

export interface PositionBreakdown {
  coin: string;
  longs: number;
  shorts: number;
  totalSize: number;
  longPercentage: number;
  shortPercentage: number;
  openInterest: number;
  timestamp: number;
}

/**
 * Fetch position breakdown (long/short ratio) for a specific coin
 * Uses Hyperliquid API to get open interest data
 */
export async function getPositionBreakdown(coin: string): Promise<PositionBreakdown | null> {
  try {
    // Get asset contexts from Hyperliquid API
    const response = await axios.post('https://api.hyperliquid.xyz/info', {
      type: 'metaAndAssetCtxs',
    });

    if (!response.data || !Array.isArray(response.data) || response.data.length < 2) {
      logger.warn('Invalid metaAndAssetCtxs response');
      return null;
    }

    const [meta, contexts] = response.data;
    
    // Find the index of our coin
    const coinIndex = meta.universe.findIndex((asset: any) => asset.name === coin);
    if (coinIndex === -1) {
      logger.warn({ coin }, 'Coin not found in universe');
      return null;
    }

    const ctx = contexts[coinIndex];
    if (!ctx) {
      logger.warn({ coin }, 'Context not found for coin');
      return null;
    }

    // Get open interest from context
    const openInterest = parseFloat(ctx.openInterest || '0');
    
    // Note: Hyperliquid API doesn't directly provide long/short breakdown
    // This would require aggregating all user positions or using a third-party service like HyperDash
    // For now, we'll return OI data and estimate based on funding rate
    
    // Funding rate can give us a hint about market sentiment:
    // Positive funding = more longs (longs pay shorts)
    // Negative funding = more shorts (shorts pay longs)
    const funding = parseFloat(ctx.funding || '0');
    
    // Rough estimation: use funding to estimate long/short ratio
    // This is a simplified heuristic - for accurate data, we'd need HyperDash API or similar
    let longPercentage = 50; // Default to 50/50
    let shortPercentage = 50;
    
    if (Math.abs(funding) > 0.00001) {
      // Adjust based on funding (positive funding = more longs)
      // Scale funding to a reasonable percentage adjustment
      const fundingBps = funding * 10000; // Convert to basis points
      const adjustment = Math.min(Math.abs(fundingBps) * 2, 20); // Cap at 20% adjustment
      
      if (funding > 0) {
        longPercentage = 50 + adjustment;
        shortPercentage = 50 - adjustment;
      } else {
        longPercentage = 50 - adjustment;
        shortPercentage = 50 + adjustment;
      }
    }
    
    const totalSize = openInterest;
    const longs = (totalSize * longPercentage) / 100;
    const shorts = (totalSize * shortPercentage) / 100;
    
    return {
      coin,
      longs,
      shorts,
      totalSize,
      longPercentage,
      shortPercentage,
      openInterest,
      timestamp: Date.now(),
    };
  } catch (error: any) {
    logger.error({ error: error.message, coin }, 'Failed to fetch position breakdown');
    return null;
  }
}

/**
 * Fetch position breakdowns for multiple coins
 */
export async function getMultiplePositionBreakdowns(coins: string[]): Promise<PositionBreakdown[]> {
  try {
    // Get all asset contexts in one call
    const response = await axios.post('https://api.hyperliquid.xyz/info', {
      type: 'metaAndAssetCtxs',
    });

    if (!response.data || !Array.isArray(response.data) || response.data.length < 2) {
      logger.warn('Invalid metaAndAssetCtxs response');
      return [];
    }

    const [meta, contexts] = response.data;
    const breakdowns: PositionBreakdown[] = [];
    
    for (const coin of coins) {
      const coinIndex = meta.universe.findIndex((asset: any) => asset.name === coin);
      if (coinIndex === -1) continue;
      
      const ctx = contexts[coinIndex];
      if (!ctx) continue;
      
      const openInterest = parseFloat(ctx.openInterest || '0');
      const funding = parseFloat(ctx.funding || '0');
      
      let longPercentage = 50;
      let shortPercentage = 50;
      
      if (Math.abs(funding) > 0.00001) {
        const fundingBps = funding * 10000;
        const adjustment = Math.min(Math.abs(fundingBps) * 2, 20);
        
        if (funding > 0) {
          longPercentage = 50 + adjustment;
          shortPercentage = 50 - adjustment;
        } else {
          longPercentage = 50 - adjustment;
          shortPercentage = 50 + adjustment;
        }
      }
      
      const totalSize = openInterest;
      const longs = (totalSize * longPercentage) / 100;
      const shorts = (totalSize * shortPercentage) / 100;
      
      breakdowns.push({
        coin,
        longs,
        shorts,
        totalSize,
        longPercentage,
        shortPercentage,
        openInterest,
        timestamp: Date.now(),
      });
    }
    
    logger.debug({ count: breakdowns.length }, 'Fetched position breakdowns');
    return breakdowns;
  } catch (error: any) {
    logger.error({ error: error.message, coins }, 'Failed to fetch multiple position breakdowns');
    return [];
  }
}
