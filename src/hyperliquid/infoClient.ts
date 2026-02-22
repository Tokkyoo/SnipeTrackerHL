import axios, { AxiosInstance } from 'axios';
import { Position, MarketData } from '../core/positionModel';
import { logger } from '../utils/logger';

/**
 * InfoClient fetches read-only data from Hyperliquid API
 */
export class InfoClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string = 'https://api.hyperliquid.xyz') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get all positions for a given address
   */
  async getPositions(address: string): Promise<Position[]> {
    try {
      logger.debug({ address }, 'Fetching positions');

      const response = await this.client.post('/info', {
        type: 'clearinghouseState',
        user: address,
      });

      const data = response.data;
      
      if (!data.assetPositions || !Array.isArray(data.assetPositions)) {
        return [];
      }

      const positions: Position[] = data.assetPositions
        .filter((ap: any) => ap.position && Math.abs(parseFloat(ap.position.szi)) > 0)
        .map((ap: any) => ({
          coin: ap.position.coin,
          size: parseFloat(ap.position.szi),
          entryPx: parseFloat(ap.position.entryPx || '0'),
          leverage: ap.position.leverage?.value || undefined,
          unrealizedPnl: parseFloat(ap.position.unrealizedPnl || '0'),
          marginUsed: parseFloat(ap.position.marginUsed || '0'),
          liquidationPx: parseFloat(ap.position.liquidationPx || '0'),
          returnOnEquity: parseFloat(ap.position.returnOnEquity || '0'),
          cumFunding: parseFloat(ap.position.cumFunding?.sinceOpen || '0'),
          updatedAt: Date.now(),
        }));

      logger.debug({ address, count: positions.length }, 'Fetched positions');
      return positions;
    } catch (error: any) {
      logger.error({ error: error.message, address }, 'Failed to fetch positions');
      return []; // Return empty array on error instead of throwing
    }
  }

  /**
   * Get market data (mark price, last price) for coins
   */
  async getMarketData(coins: string[]): Promise<Map<string, MarketData>> {
    try {
      logger.debug({ coins }, 'Fetching market data');

      const response = await this.client.post('/info', {
        type: 'metaAndAssetCtxs',
      });

      const result = new Map<string, MarketData>();
      
      if (!response.data || !Array.isArray(response.data) || response.data.length < 2) {
        return result;
      }

      const [meta, assetCtxs] = response.data;
      
      if (!meta.universe || !Array.isArray(assetCtxs)) {
        return result;
      }

      // Map each coin to its asset context
      meta.universe.forEach((asset: any, index: number) => {
        if (coins.includes(asset.name) && assetCtxs[index]) {
          const ctx = assetCtxs[index];
          result.set(asset.name, {
            coin: asset.name,
            markPrice: parseFloat(ctx.markPx || '0'),
            lastPrice: parseFloat(ctx.midPx || ctx.markPx || '0'),
            timestamp: Date.now(),
          });
        }
      });

      logger.debug({ count: result.size }, 'Fetched market data');
      return result;
    } catch (error: any) {
      logger.error({ error: error.message, coins }, 'Failed to fetch market data');
      return new Map(); // Return empty map on error
    }
  }

  /**
   * Get funding rates for coins
   */
  async getFundingRates(coins: string[]): Promise<Map<string, number>> {
    try {
      logger.debug({ coins }, 'Fetching funding rates');

      const response = await this.client.post('/info', {
        type: 'metaAndAssetCtxs',
      });

      const result = new Map<string, number>();
      
      if (!response.data || !Array.isArray(response.data) || response.data.length < 2) {
        return result;
      }

      const [meta, assetCtxs] = response.data;
      
      if (!meta.universe || !Array.isArray(assetCtxs)) {
        return result;
      }

      // Map each coin to its funding rate
      meta.universe.forEach((asset: any, index: number) => {
        if (coins.includes(asset.name) && assetCtxs[index]) {
          const ctx = assetCtxs[index];
          const fundingRate = parseFloat(ctx.funding || '0');
          result.set(asset.name, fundingRate);
        }
      });

      logger.debug({ count: result.size }, 'Fetched funding rates');
      return result;
    } catch (error: any) {
      logger.error({ error: error.message, coins }, 'Failed to fetch funding rates');
      return new Map();
    }
  }

  /**
   * Get account equity and margin info
   */
  async getAccountInfo(address: string): Promise<{
    equity: number;
    totalMarginUsed: number;
    totalNotional: number;
  }> {
    try {
      logger.debug({ address }, 'Fetching account info');

      const response = await this.client.post('/info', {
        type: 'clearinghouseState',
        user: address,
      });

      const data = response.data;
      
      return {
        equity: parseFloat(data.marginSummary?.accountValue || '0'),
        totalMarginUsed: parseFloat(data.marginSummary?.totalMarginUsed || '0'),
        totalNotional: parseFloat(data.marginSummary?.totalNtlPos || '0'),
      };
    } catch (error: any) {
      logger.error({ error: error.message, address }, 'Failed to fetch account info');
      return {
        equity: 0,
        totalMarginUsed: 0,
        totalNotional: 0,
      };
    }
  }

  /**
   * Get user funding history
   */
  async getUserFunding(address: string, startTime: number, endTime?: number): Promise<any[]> {
    try {
      const response = await this.client.post('/info', {
        type: 'userFunding',
        user: address,
        startTime,
        endTime: endTime || Date.now(),
      });

      return response.data || [];
    } catch (error: any) {
      logger.error({ error: error.message, address }, 'Failed to fetch user funding');
      return [];
    }
  }

  /**
   * Get leaderboard of top traders
   */
  async getLeaderBoard(): Promise<Array<{ ethAddress: string; accountValue: string; pnl: string }>> {
    try {
      logger.debug('Fetching leaderboard');

      // Try different API endpoints/formats
      let response;
      try {
        // Try 'spotLeaderboard' first (common for trading platforms)
        response = await this.client.post('/info', {
          type: 'spotLeaderboard',
        });
      } catch (e1) {
        try {
          // Try 'perpLeaderboard' for perpetual futures
          response = await this.client.post('/info', {
            type: 'perpLeaderboard',
          });
        } catch (e2) {
          try {
            // Try 'globalStats' which might contain leaderboard info
            response = await this.client.post('/info', {
              type: 'globalStats',
            });
          } catch (e3) {
            // If all fail, throw the original error
            throw e1;
          }
        }
      }

      if (!response.data || !Array.isArray(response.data)) {
        logger.warn({ data: response.data }, 'Leaderboard data is not an array');
        return [];
      }

      logger.debug({ count: response.data.length }, 'Fetched leaderboard');
      return response.data;
    } catch (error: any) {
      logger.error({ error: error.message, response: error.response?.data }, 'Failed to fetch leaderboard');
      return [];
    }
  }

  /**
   * Get all perpetual metadata
   */
  async getMeta(): Promise<any> {
    try {
      const response = await this.client.post('/info', {
        type: 'meta',
      });

      return response.data;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch meta');
      return null;
    }
  }

  /**
   * Get metadata and asset contexts (includes OI, funding, etc.)
   */
  async getMetaAndAssetCtxs(): Promise<{ meta: any; contexts: any[] } | null> {
    try {
      logger.debug('Fetching meta and asset contexts');

      const response = await this.client.post('/info', {
        type: 'metaAndAssetCtxs',
      });

      if (!response.data || !Array.isArray(response.data) || response.data.length < 2) {
        logger.warn('Invalid metaAndAssetCtxs response');
        return null;
      }

      const [meta, contexts] = response.data;
      
      logger.debug({ assetCount: meta.universe?.length || 0 }, 'Fetched meta and contexts');
      return { meta, contexts };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch metaAndAssetCtxs');
      return null;
    }
  }

  /**
   * Get all user positions for a specific coin across all users
   * Note: This requires aggregating data from the leaderboard or available public data
   */
  async getAllOpenPositions(coin: string): Promise<{ longs: number; shorts: number } | null> {
    try {
      // Unfortunately, Hyperliquid API doesn't provide a direct way to get all positions
      // We would need to aggregate from individual user queries or use a third-party service
      // For now, return null to indicate this feature needs external data
      logger.warn({ coin }, 'getAllOpenPositions not implemented - requires external data source');
      return null;
    } catch (error: any) {
      logger.error({ error: error.message, coin }, 'Failed to fetch all open positions');
      return null;
    }
  }
  /**
   * Get open interest breakdown for a coin (longs vs shorts)
   */
  async getOpenInterest(coin: string): Promise<{
    coin: string;
    totalOi: number;
    longOi: number;
    shortOi: number;
    longPercentage: number;
    shortPercentage: number;
  } | null> {
    try {
      logger.debug({ coin }, 'Fetching open interest');

      // Get metadata and asset contexts which include funding and OI data
      const data = await this.getMetaAndAssetCtxs();
      
      if (!data || !data.meta.universe) {
        logger.warn({ coin }, 'No metadata available');
        return null;
      }

      // Find the coin index in the universe
      const coinIndex = data.meta.universe.findIndex((asset: any) => asset.name === coin);
      
      if (coinIndex === -1 || !data.contexts[coinIndex]) {
        logger.warn({ coin }, 'Coin not found in universe');
        return null;
      }

      const ctx = data.contexts[coinIndex];
      
      // Open interest data from context
      const openInterest = parseFloat(ctx.openInterest || '0');
      const funding = parseFloat(ctx.funding || '0');
      
      // Estimate long/short split based on funding rate
      // Positive funding = more longs (longs pay shorts)
      // Negative funding = more shorts (shorts pay longs)
      // This is an estimation as Hyperliquid doesn't directly expose long/short split
      let longPercentage = 50;
      let shortPercentage = 50;
      
      if (funding > 0) {
        // More longs, funding is in basis points per 8 hours typically
        longPercentage = Math.min(70, 50 + Math.abs(funding) * 10000);
        shortPercentage = 100 - longPercentage;
      } else if (funding < 0) {
        // More shorts
        shortPercentage = Math.min(70, 50 + Math.abs(funding) * 10000);
        longPercentage = 100 - shortPercentage;
      }
      
      const longOi = openInterest * (longPercentage / 100);
      const shortOi = openInterest * (shortPercentage / 100);

      logger.debug({ coin, longOi, shortOi, totalOi: openInterest, funding }, 'Fetched open interest');

      return {
        coin,
        totalOi: openInterest,
        longOi,
        shortOi,
        longPercentage,
        shortPercentage,
      };
    } catch (error: any) {
      logger.error({ error: error.message, coin }, 'Failed to fetch open interest');
      return null;
    }
  }}
