import { InfoClient } from '../hyperliquid/infoClient';
import { Aggregator } from './aggregator';
import { Targeting, PositionTarget } from './targeting';
import { Executor } from './executor';
import { Position } from './positionModel';
import { logger } from '../utils/logger';

export interface PositionChange {
  type: 'opened' | 'modified' | 'closed';
  coin: string;
  position?: Position;
  previousSize?: number;
}

/**
 * CopyTradingLoop is the main orchestrator
 * Polls leader/follower positions, calculates targets, and executes orders
 */
export class CopyTradingLoop {
  private infoClient: InfoClient;
  private aggregator: Aggregator;
  private targeting: Targeting;
  private executor: Executor;
  private enabled: boolean;
  private running: boolean;
  private pollIntervalMs: number;
  private leaderAddresses: string[];
  private followerAddress: string;
  private ratio: number;
  private notionalCap: number;
  private tif: 'IOC' | 'GTC';
  private copyMode: 'full' | 'entry-only' | 'signals-only';
  private minNotionalForNotification: number;
  private previousLeaderPositions: Map<string, Position[]>;
  private onLeaderPositionChange?: (leader: string, changes: PositionChange[]) => void;
  private onPositionsUpdate?: (positions: Position[]) => void;

  constructor(
    infoClient: InfoClient,
    aggregator: Aggregator,
    targeting: Targeting,
    executor: Executor,
    config: {
      pollIntervalMs: number;
      leaderAddresses: string[];
      followerAddress: string;
      ratio: number;
      notionalCap: number;
      tif: 'IOC' | 'GTC';
      dryRun?: boolean;
      copyMode?: 'full' | 'entry-only' | 'signals-only';
      minNotionalForNotification?: number;
    },
  ) {
    this.infoClient = infoClient;
    this.aggregator = aggregator;
    this.targeting = targeting;
    this.executor = executor;
    this.enabled = false;
    this.running = false;
    this.pollIntervalMs = config.pollIntervalMs;
    this.leaderAddresses = config.leaderAddresses;
    this.followerAddress = config.followerAddress;
    this.ratio = config.ratio;
    // In DRY_RUN mode, disable chunking by setting notionalCap to 0
    this.notionalCap = config.dryRun ? 0 : config.notionalCap;
    this.tif = config.tif;
    this.copyMode = config.copyMode || 'full';
    this.minNotionalForNotification = config.minNotionalForNotification || 5000;
    this.previousLeaderPositions = new Map();
    this.onLeaderPositionChange = undefined;
  }

  /**
   * Start the copy trading loop
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Loop already running');
      return;
    }

    this.running = true;
    logger.info('Copy trading loop started');

    while (this.running) {
      try {
        if (this.enabled) {
          await this.tick();
        } else {
          logger.debug('Loop disabled - skipping tick');
        }
      } catch (error: any) {
        logger.error({ error: error.message }, 'Error in loop tick');
      }

      // Wait for next poll interval
      await this.sleep(this.pollIntervalMs);
    }

    logger.info('Copy trading loop stopped');
  }

  /**
   * Stop the loop
   */
  stop(): void {
    this.running = false;
    logger.info('Stopping copy trading loop...');
  }

  /**
   * Enable auto-copy
   */
  enable(): void {
    this.enabled = true;
    logger.info('Auto-copy enabled');
  }

  /**
   * Disable auto-copy
   */
  disable(): void {
    this.enabled = false;
    logger.info('Auto-copy disabled');
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Set callback for leader position changes
   */
  setPositionChangeCallback(callback: (leader: string, changes: PositionChange[]) => void): void {
    this.onLeaderPositionChange = callback;
  }

  /**
   * Set callback for positions updates
   */
  setPositionsUpdateCallback(callback: (positions: Position[]) => void): void {
    this.onPositionsUpdate = callback;
  }

  /**
   * Get current leader addresses
   */
  getLeaderAddresses(): string[] {
    return [...this.leaderAddresses];
  }

  /**
   * Update runtime parameters
   */
  updateParams(params: {
    ratio?: number;
    notionalCap?: number;
    tif?: 'IOC' | 'GTC';
    leaderAddresses?: string[];
    copyMode?: 'full' | 'entry-only' | 'signals-only';
  }): void {
    if (params.ratio !== undefined) {
      this.ratio = params.ratio;
      logger.info({ ratio: this.ratio }, 'Ratio updated');
    }
    if (params.notionalCap !== undefined) {
      this.notionalCap = params.notionalCap;
      logger.info({ notionalCap: this.notionalCap }, 'Notional cap updated');
    }
    if (params.tif !== undefined) {
      this.tif = params.tif;
      logger.info({ tif: this.tif }, 'TIF updated');
    }
    if (params.leaderAddresses !== undefined) {
      this.leaderAddresses = params.leaderAddresses;
      logger.info({ leaders: this.leaderAddresses }, 'Leader addresses updated');
    }
    if (params.copyMode !== undefined) {
      this.copyMode = params.copyMode;
      logger.info({ copyMode: this.copyMode }, 'Copy mode updated');
    }
  }

  /**
   * Single loop iteration
   */
  private async tick(): Promise<void> {
    logger.debug('Loop tick starting');

    // 1. Fetch leader positions
    const leaderPositionsMap = new Map<string, Position[]>();
    for (const leader of this.leaderAddresses) {
      try {
        const positions = await this.infoClient.getPositions(leader);
        leaderPositionsMap.set(leader, positions);

        // Detect position changes
        if (this.onLeaderPositionChange) {
          const changes = this.detectPositionChanges(leader, positions);
          if (changes.length > 0) {
            this.onLeaderPositionChange(leader, changes);
          }
        }

        // Update previous positions
        this.previousLeaderPositions.set(leader, positions);
      } catch (error: any) {
        logger.error({ leader, error: error.message }, 'Failed to fetch leader positions');
      }
    }

    if (leaderPositionsMap.size === 0) {
      logger.warn('No leader positions fetched - skipping tick');
      return;
    }

    // 2. Fetch follower positions
    let followerPositions: Position[];
    try {
      followerPositions = await this.infoClient.getPositions(this.followerAddress);
      
      // Notify positions update if callback is set
      if (this.onPositionsUpdate) {
        this.onPositionsUpdate(followerPositions);
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch follower positions');
      return;
    }

    // 3. Aggregate leader positions
    const aggregatedLeader = this.aggregator.aggregate(leaderPositionsMap);

    // 4. Detect orphaned positions (in follower but not in leaders)
    const orphaned = this.aggregator.detectOrphanedPositions(followerPositions, aggregatedLeader);
    if (orphaned.length > 0) {
      logger.info({ orphaned }, 'Detected orphaned positions - will close them');
      // Add zero-size targets for orphaned positions
      for (const coin of orphaned) {
        aggregatedLeader.set(coin, { coin, size: 0, updatedAt: Date.now() });
      }
    }

    // 5. Compute targets
    const followerPositionsMap = new Map(followerPositions.map(p => [p.coin, p]));
    let targets = this.targeting.computeTargets(aggregatedLeader, followerPositionsMap, this.ratio);

    // Filter targets based on copyMode
    if (this.copyMode === 'entry-only') {
      // Only trade on opens (0 → size) and closes (size → 0)
      targets = targets.filter(t => {
        const isOpening = Math.abs(t.currentSize) < 0.0001 && Math.abs(t.targetSize) > 0.0001;
        const isClosing = Math.abs(t.currentSize) > 0.0001 && Math.abs(t.targetSize) < 0.0001;
        return isOpening || isClosing;
      });
      
      if (targets.length < this.targeting.computeTargets(aggregatedLeader, followerPositionsMap, this.ratio).length) {
        logger.debug('Entry-only mode: Filtered out size change orders');
      }
    } else if (this.copyMode === 'signals-only') {
      // Don't execute any orders in signals-only mode
      targets = [];
      logger.debug('Signals-only mode: Not executing orders');
    }

    if (targets.length === 0) {
      logger.debug('No targets to execute');
      return;
    }

    logger.info({ targetCount: targets.length }, 'Computed position targets');

    // 6. Fetch market data for target coins
    const coinSet = new Set(targets.map(t => t.coin));
    const marketData = await this.infoClient.getMarketData(Array.from(coinSet));

    // 7. Generate orders for each target
    const allOrders = [];
    for (const target of targets) {
      const market = marketData.get(target.coin);
      const markPrice = market?.markPrice || market?.lastPrice || 0;

      if (markPrice === 0) {
        logger.warn({ coin: target.coin }, 'No market price - skipping target');
        continue;
      }

      const orders = this.targeting.generateOrders(target, markPrice, this.notionalCap, this.tif);
      allOrders.push(...orders);
    }

    if (allOrders.length === 0) {
      logger.debug('No orders to execute');
      return;
    }

    // 8. Calculate current total notional
    const accountInfo = await this.infoClient.getAccountInfo(this.followerAddress);
    const currentTotalNotional = accountInfo.totalNotional;

    // 9. Execute orders
    logger.info({ orderCount: allOrders.length }, 'Executing orders');
    const execResult = await this.executor.executeOrders(
      allOrders,
      followerPositions,
      currentTotalNotional,
      marketData,
    );

    logger.info(
      {
        executed: execResult.executedOrders.length,
        rejected: execResult.rejectedOrders.length,
        errors: execResult.errors.length,
      },
      'Execution completed',
    );
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Detect changes in leader positions
   */
  private detectPositionChanges(leader: string, currentPositions: Position[]): PositionChange[] {
    const changes: PositionChange[] = [];
    const previous = this.previousLeaderPositions.get(leader) || [];

    // Create maps for easy lookup
    const prevMap = new Map(previous.map(p => [p.coin, p]));
    const currentMap = new Map(currentPositions.map(p => [p.coin, p]));

    // Detect new positions
    for (const pos of currentPositions) {
      const prevPos = prevMap.get(pos.coin);
      if (!prevPos) {
        // New position detected
        changes.push({
          type: 'opened',
          coin: pos.coin,
          position: pos,
        });
      } else if (Math.abs(pos.size - prevPos.size) > 0.0001) {
        // Size changed
        changes.push({
          type: 'modified',
          coin: pos.coin,
          position: pos,
          previousSize: prevPos.size,
        });
      }
    }

    // Detect closed positions
    for (const prevPos of previous) {
      if (!currentMap.has(prevPos.coin)) {
        changes.push({
          type: 'closed',
          coin: prevPos.coin,
          previousSize: prevPos.size,
        });
      }
    }

    return changes;
  }

  /**
   * Get current config snapshot
   */
  getConfig(): {
    enabled: boolean;
    ratio: number;
    notionalCap: number;
    tif: string;
    leaderAddresses: string[];
    pollIntervalMs: number;
    minNotionalForNotification: number;
  } {
    return {
      enabled: this.enabled,
      ratio: this.ratio,
      notionalCap: this.notionalCap,
      tif: this.tif,
      leaderAddresses: [...this.leaderAddresses],
      pollIntervalMs: this.pollIntervalMs,
      minNotionalForNotification: this.minNotionalForNotification,
    };
  }
}
