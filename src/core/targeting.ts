import { Position, OrderRequest, OrderSide, TimeInForce } from './positionModel';
import { logger } from '../utils/logger';

/**
 * PositionTarget represents the desired position state
 */
export interface PositionTarget {
  coin: string;
  targetSize: number;
  currentSize: number;
  delta: number;
}

/**
 * Targeting calculates the delta between current and target positions
 * and generates orders to achieve the target
 */
export class Targeting {
  /**
   * Calculate target position for follower based on leader position and ratio
   */
  calculateTarget(
    leaderSize: number,
    currentFollowerSize: number,
    ratio: number,
  ): PositionTarget {
    const targetSize = leaderSize * ratio;
    const delta = targetSize - currentFollowerSize;

    return {
      coin: '',
      targetSize,
      currentSize: currentFollowerSize,
      delta,
    };
  }

  /**
   * Compute all position targets for coins
   */
  computeTargets(
    aggregatedLeader: Map<string, Position>,
    followerPositions: Map<string, Position>,
    ratio: number,
  ): PositionTarget[] {
    const targets: PositionTarget[] = [];
    const allCoins = new Set<string>();

    // Collect all coins from leader and follower
    for (const coin of aggregatedLeader.keys()) {
      allCoins.add(coin);
    }
    for (const coin of followerPositions.keys()) {
      allCoins.add(coin);
    }

    for (const coin of allCoins) {
      const leaderSize = aggregatedLeader.get(coin)?.size || 0;
      const currentFollowerSize = followerPositions.get(coin)?.size || 0;

      const target = this.calculateTarget(leaderSize, currentFollowerSize, ratio);
      target.coin = coin;

      // Only include if there's a meaningful delta
      if (Math.abs(target.delta) > 0.0001) {
        targets.push(target);
      }
    }

    return targets;
  }

  /**
   * Convert a position target into order(s)
   * 
   * @param target The position target
   * @param markPrice Current mark price for the coin
   * @param notionalCap Max notional per order (USD), set to 0 to disable chunking
   * @param tif Time in force
   * @returns Array of order requests (chunked if necessary)
   */
  generateOrders(
    target: PositionTarget,
    markPrice: number,
    notionalCap: number,
    tif: TimeInForce,
  ): OrderRequest[] {
    const orders: OrderRequest[] = [];

    // Determine side
    const side: OrderSide = target.delta > 0 ? 'buy' : 'sell';
    const sizeToTrade = Math.abs(target.delta);

    // Determine if we're reducing an existing position
    const isReducing = this.isReducingPosition(target.currentSize, target.targetSize);

    // If notionalCap is 0 or negative, disable chunking (useful for dry-run mode)
    if (notionalCap <= 0) {
      orders.push({
        coin: target.coin,
        side,
        size: sizeToTrade,
        tif,
        reduceOnly: isReducing,
      });
      return orders;
    }

    // Calculate max size per order based on notional cap
    const notionalPerUnit = markPrice;
    const maxSizePerOrder = notionalCap / notionalPerUnit;

    // Chunk the size if necessary
    if (sizeToTrade <= maxSizePerOrder) {
      // Single order
      orders.push({
        coin: target.coin,
        side,
        size: sizeToTrade,
        tif,
        reduceOnly: isReducing,
      });
    } else {
      // Multiple orders (chunking)
      let remainingSize = sizeToTrade;
      while (remainingSize > 0.0001) {
        const chunkSize = Math.min(remainingSize, maxSizePerOrder);
        orders.push({
          coin: target.coin,
          side,
          size: chunkSize,
          tif,
          reduceOnly: isReducing,
        });
        remainingSize -= chunkSize;
      }
    }

    logger.debug(
      { coin: target.coin, target, side, orderCount: orders.length, isReducing },
      'Generated orders for target',
    );

    return orders;
  }

  /**
   * Check if we're reducing an existing position
   * reduceOnly should be true when:
   * - We have a long position and targetSize < currentSize
   * - We have a short position and targetSize > currentSize (closer to 0)
   */
  private isReducingPosition(currentSize: number, targetSize: number): boolean {
    if (currentSize > 0) {
      // Long position: reducing if target < current
      return targetSize < currentSize;
    } else if (currentSize < 0) {
      // Short position: reducing if target > current (moving towards 0)
      return targetSize > currentSize;
    }
    return false;
  }
}
