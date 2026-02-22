import { InfoClient } from '../hyperliquid/infoClient';
import { logger } from '../utils/logger';

/**
 * Trader performance metrics
 */
export interface TraderMetrics {
  address: string;
  equity: number;
  totalNotional: number;
  positionCount: number;
  totalPnl: number;
  riskScore: number; // 0-100, higher is better
  activityScore: number; // 0-100, higher is better
  overallScore: number; // Combined score
}

/**
 * Known top traders on Hyperliquid (curated list)
 * These are publicly known successful traders
 * Add real Hyperliquid trader addresses here
 */
// Top Hyperliquid traders (add more as you discover them)
const KNOWN_TOP_TRADERS: string[] = [
  '0x010461C14e146ac35Fe42271BDC1134EE31C703a',
  '0x0D5e5b3c9a0b6f5e2a1e8b4c3d2e1f0a9b8c7d6e',
  '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
  // Add your discovered trader addresses here
];

/**
 * TraderAnalyzer finds and ranks the best traders to follow
 */
export class TraderAnalyzer {
  private infoClient: InfoClient;

  constructor(infoClient: InfoClient) {
    this.infoClient = infoClient;
  }

  /**
   * Analyze a single trader
   */
  async analyzeTrader(address: string): Promise<TraderMetrics | null> {
    try {
      logger.info({ address }, 'Analyzing trader');

      // Get account info
      const accountInfo = await this.infoClient.getAccountInfo(address);
      
      logger.debug({ address, equity: accountInfo.equity, notional: accountInfo.totalNotional }, 'Got account info');

      // Skip if no equity or no notional (inactive account)
      if (accountInfo.equity === 0 || accountInfo.totalNotional === 0) {
        logger.info({ address, equity: accountInfo.equity, notional: accountInfo.totalNotional }, 'Trader is inactive - skipping');
        return null;
      }

      // Get current positions
      const positions = await this.infoClient.getPositions(address);
      
      logger.debug({ address, positionCount: positions.length }, 'Got positions');

      // Calculate total unrealized PnL
      const totalPnl = positions.reduce((sum, pos) => sum + (pos.unrealizedPnl || 0), 0);

      // Calculate risk score (based on leverage and diversification)
      const avgLeverage = positions.length > 0
        ? positions.reduce((sum, p) => sum + (p.leverage || 1), 0) / positions.length
        : 1;
      
      const riskScore = Math.max(0, 100 - (avgLeverage - 1) * 10); // Lower leverage = higher score

      // Calculate activity score (based on notional and position count)
      const activityScore = Math.min(100, 
        (accountInfo.totalNotional / 1000) + // $1000 notional = 1 point
        (positions.length * 10) // Each position = 10 points
      );

      // Overall score (weighted combination)
      // Only give points if trader is actually active
      const hasActivity = positions.length > 0 && accountInfo.totalNotional > 0;
      const overallScore = hasActivity ? (
        (accountInfo.equity > 1000 ? 25 : accountInfo.equity / 1000 * 25) + // Scale equity score 0-25
        (riskScore * 0.35) + // 35% weight on risk management
        (activityScore * 0.30) + // 30% weight on activity
        (totalPnl > 0 ? 10 : 0) // 10% bonus for positive PnL
      ) : 0;

      const metrics = {
        address,
        equity: accountInfo.equity,
        totalNotional: accountInfo.totalNotional,
        positionCount: positions.length,
        totalPnl,
        riskScore,
        activityScore,
        overallScore,
      };

      logger.info({ address, score: overallScore.toFixed(1) }, 'Trader analyzed');
      
      return metrics;
    } catch (error: any) {
      logger.error({ error: error.message, address }, 'Failed to analyze trader');
      return null;
    }
  }

  /**
   * Find the best traders from a list of candidates
   */
  async findBestTraders(
    candidates: string[],
    topN: number = 3,
    minEquity: number = 100,
  ): Promise<TraderMetrics[]> {
    logger.info({ candidates: candidates.length, topN, minEquity }, 'Finding best traders');

    const metrics: TraderMetrics[] = [];

    // Analyze all candidates in parallel (in batches to avoid rate limits)
    const batchSize = 5;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      logger.info({ batchStart: i, batchSize: batch.length }, 'Analyzing batch');
      
      const batchResults = await Promise.all(
        batch.map(addr => this.analyzeTrader(addr))
      );

      const validResults = batchResults.filter(m => m !== null) as TraderMetrics[];
      metrics.push(...validResults);
      
      logger.info({ validResults: validResults.length, totalSoFar: metrics.length }, 'Batch analyzed');

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < candidates.length) {
        await this.sleep(500);
      }
    }

    logger.info({ totalAnalyzed: metrics.length }, 'All traders analyzed');

    // Filter by minimum criteria with relaxed thresholds
    const filtered = metrics.filter(m => {
      const passes = m.equity >= minEquity &&
        m.positionCount > 0 &&
        m.totalNotional > 0;
      
      if (!passes) {
        logger.debug({
          address: m.address,
          equity: m.equity,
          positions: m.positionCount,
          notional: m.totalNotional
        }, 'Trader filtered out');
      }
      
      return passes;
    });

    logger.info({ filtered: filtered.length, originalCount: metrics.length }, 'Traders after filtering');

    // Sort by overall score
    const sorted = filtered.sort((a, b) => b.overallScore - a.overallScore);

    // Return top N
    const topTraders = sorted.slice(0, topN);

    logger.info(
      {
        analyzed: metrics.length,
        filtered: filtered.length,
        topN: topTraders.length,
      },
      'Best traders found',
    );

    return topTraders;
  }

  /**
   * Get recommended traders (using curated list + analysis)
   */
  async getRecommendedTraders(topN: number = 3, customAddresses?: string[]): Promise<string[]> {
    logger.info({ topN, hasCustom: !!customAddresses }, 'Getting recommended traders');

    let candidates: string[] = [];

    // If custom addresses provided, use only those
    if (customAddresses && customAddresses.length > 0) {
      candidates = [...customAddresses];
      logger.info({ count: candidates.length }, 'Using custom addresses');
    } else {
      // Use known top traders (Hyperliquid API doesn't have public leaderboard endpoint)
      logger.info('Using known top traders list');
      candidates = [...KNOWN_TOP_TRADERS];
      
      if (candidates.length === 0) {
        logger.warn('No known traders configured. Please add trader addresses to KNOWN_TOP_TRADERS or provide custom addresses.');
        return [];
      }
    }

    // Remove duplicates
    candidates = [...new Set(candidates)];

    if (candidates.length === 0) {
      logger.warn('No trader addresses to analyze');
      return [];
    }

    logger.info({ candidateCount: candidates.length, topN }, 'Analyzing traders...');

    // Analyze them - use lower minimum equity threshold
    const bestTraders = await this.findBestTraders(candidates, topN, 100); // Min 100 USD equity (lowered from 500)

    logger.info({ found: bestTraders.length, requested: topN }, 'Best traders found');

    return bestTraders.map(t => t.address);
  }

  /**
   * Print trader analysis report
   */
  printReport(metrics: TraderMetrics[]): string {
    let report = '\n📊 Trader Analysis Report\n';
    report += '═══════════════════════════════════════\n\n';

    metrics.forEach((m, i) => {
      report += `${i + 1}. ${m.address}\n`;
      report += `   Equity: $${m.equity.toFixed(2)}\n`;
      report += `   Notional: $${m.totalNotional.toFixed(2)}\n`;
      report += `   Positions: ${m.positionCount}\n`;
      report += `   PnL: $${m.totalPnl.toFixed(2)}\n`;
      report += `   Risk Score: ${m.riskScore.toFixed(1)}/100\n`;
      report += `   Activity Score: ${m.activityScore.toFixed(1)}/100\n`;
      report += `   Overall Score: ${m.overallScore.toFixed(1)}/100\n\n`;
    });

    return report;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
