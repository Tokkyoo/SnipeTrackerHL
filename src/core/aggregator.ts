import { Position } from './positionModel';
import { logger } from '../utils/logger';

/**
 * Aggregator combines positions from multiple leaders into a single target position
 */
export class Aggregator {
  /**
   * Aggregate positions from multiple leaders
   * For MVP: simple average of sizes (equal weights)
   * 
   * @param leaderPositions Map of leader address -> positions
   * @returns Aggregated positions by coin
   */
  aggregate(leaderPositions: Map<string, Position[]>): Map<string, Position> {
    const coinSizes = new Map<string, number[]>();

    // Collect all sizes per coin
    for (const [leader, positions] of leaderPositions) {
      for (const pos of positions) {
        if (!coinSizes.has(pos.coin)) {
          coinSizes.set(pos.coin, []);
        }
        coinSizes.get(pos.coin)!.push(pos.size);
      }
    }

    // Calculate average size per coin
    const aggregated = new Map<string, Position>();
    for (const [coin, sizes] of coinSizes) {
      const avgSize = sizes.reduce((sum, s) => sum + s, 0) / sizes.length;
      
      aggregated.set(coin, {
        coin,
        size: avgSize,
        updatedAt: Date.now(),
      });

      logger.debug({ coin, sizes, avgSize }, 'Aggregated position');
    }

    return aggregated;
  }

  /**
   * Detect positions that exist in follower but not in aggregated leaders
   * These should be closed
   */
  detectOrphanedPositions(followerPositions: Position[], aggregatedLeader: Map<string, Position>): string[] {
    const orphaned: string[] = [];

    for (const pos of followerPositions) {
      if (Math.abs(pos.size) > 0.0001 && !aggregatedLeader.has(pos.coin)) {
        orphaned.push(pos.coin);
      }
    }

    return orphaned;
  }
}
