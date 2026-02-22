import { OrderRequest, OrderResult } from './positionModel';
import { ExchangeClient } from '../hyperliquid/exchangeClient';
import { RiskEngine } from './riskEngine';
import { logger } from '../utils/logger';

/**
 * ExecutionResult contains the outcome of an execution attempt
 */
export interface ExecutionResult {
  success: boolean;
  executedOrders: OrderResult[];
  rejectedOrders: { order: OrderRequest; reason: string }[];
  errors: string[];
}

/**
 * Executor handles order execution with retries and risk checks
 */
export class Executor {
  private exchangeClient: ExchangeClient;
  private riskEngine: RiskEngine;
  private maxRetries: number = 3;
  private retryDelayMs: number = 1000;
  private dryRunLogOnly: boolean;

  // Execution counters
  private counters = {
    execCount: 0,
    rejectCount: 0,
    errorCount: 0,
  };

  constructor(exchangeClient: ExchangeClient, riskEngine: RiskEngine, dryRunLogOnly: boolean = false) {
    this.exchangeClient = exchangeClient;
    this.riskEngine = riskEngine;
    this.dryRunLogOnly = dryRunLogOnly;
  }

  /**
   * Execute multiple orders with risk checks and retries
   */
  async executeOrders(
    orders: OrderRequest[],
    currentPositions: any[],
    currentTotalNotional: number,
    marketData: Map<string, any>,
  ): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      success: true,
      executedOrders: [],
      rejectedOrders: [],
      errors: [],
    };

    for (const order of orders) {
      try {
        // Get market price for risk check
        const market = marketData.get(order.coin);
        const markPrice = market?.markPrice || market?.lastPrice || 0;

        if (markPrice === 0) {
          logger.warn({ coin: order.coin }, 'No market price available - skipping order');
          result.rejectedOrders.push({
            order,
            reason: 'No market price available',
          });
          this.counters.rejectCount++;
          continue;
        }

        // Risk check
        const riskCheck = this.riskEngine.checkOrder(order, currentPositions, currentTotalNotional, markPrice);

        if (!riskCheck.allowed) {
          // Use debug for cooldown rejections to reduce log spam
          const logLevel = riskCheck.reason?.includes('Cooldown') ? 'debug' : 'warn';
          logger[logLevel]({ order: this.sanitize(order), reason: riskCheck.reason }, 'Order rejected by risk engine');
          result.rejectedOrders.push({
            order,
            reason: riskCheck.reason || 'Risk check failed',
          });
          this.counters.rejectCount++;
          continue;
        }

        // Dry run check
        if (this.dryRunLogOnly) {
          logger.debug({ order: this.sanitize(order) }, 'DRY RUN: Order would be executed');
          result.executedOrders.push({
            success: true,
            orderId: `dryrun-${Date.now()}`,
            filledSize: order.size,
          });
          // Record cooldown even in DRY RUN to avoid spam
          this.riskEngine.recordExecution(order.coin);
          this.counters.execCount++;
          continue;
        }

        // Execute with retries
        const orderResult = await this.executeWithRetry(order);

        if (orderResult.success) {
          result.executedOrders.push(orderResult);
          this.riskEngine.recordExecution(order.coin);
          this.counters.execCount++;
          logger.info(
            { order: this.sanitize(order), orderId: orderResult.orderId },
            'Order executed successfully',
          );
        } else {
          result.errors.push(orderResult.error || 'Unknown error');
          this.riskEngine.recordError();
          this.counters.errorCount++;
          result.success = false;
          logger.error({ order: this.sanitize(order), error: orderResult.error }, 'Order execution failed');
        }
      } catch (error: any) {
        result.errors.push(error.message);
        this.riskEngine.recordError();
        this.counters.errorCount++;
        result.success = false;
        logger.error({ order: this.sanitize(order), error: error.message }, 'Unexpected error during execution');
      }
    }

    return result;
  }

  /**
   * Execute a single order with exponential backoff retry
   */
  private async executeWithRetry(order: OrderRequest): Promise<OrderResult> {
    let lastError: string = '';

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.exchangeClient.placeOrder(order);

        if (result.success) {
          return result;
        }

        lastError = result.error || 'Unknown error';
        logger.warn(
          { order: this.sanitize(order), attempt, maxRetries: this.maxRetries, error: lastError },
          'Order execution attempt failed',
        );

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      } catch (error: any) {
        lastError = error.message || 'Unknown error';
        logger.error(
          { order: this.sanitize(order), attempt, maxRetries: this.maxRetries, error: lastError },
          'Exception during order execution',
        );

        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError || 'Max retries exceeded',
    };
  }

  /**
   * Get execution counters
   */
  getCounters(): { execCount: number; rejectCount: number; errorCount: number } {
    return { ...this.counters };
  }

  /**
   * Reset counters
   */
  resetCounters(): void {
    this.counters.execCount = 0;
    this.counters.rejectCount = 0;
    this.counters.errorCount = 0;
  }

  /**
   * Sanitize order for logging (remove sensitive data)
   */
  private sanitize(order: OrderRequest): any {
    return {
      coin: order.coin,
      side: order.side,
      size: order.size,
      tif: order.tif,
      reduceOnly: order.reduceOnly,
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
