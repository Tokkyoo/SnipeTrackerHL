import { OrderRequest, Position } from './positionModel';
import { logger } from '../utils/logger';

/**
 * Risk check result
 */
export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  errorCount: number;
  windowStart: number;
}

/**
 * RiskEngine validates orders before execution
 * Implements:
 * - Max leverage per coin
 * - Max total notional across all positions
 * - Cooldown per coin
 * - PANIC mode (blocks all trading)
 * - Circuit breaker (auto-disable after N errors in M minutes)
 */
export class RiskEngine {
  private maxLeverage: number;
  private maxTotalNotional: number;
  private cooldownMs: number;
  private panicMode: boolean;
  private autoTradingDisabled: boolean;

  // Cooldown tracking: coin -> last execution timestamp
  private lastExecByCoin: Map<string, number>;

  // Circuit breaker config
  private circuitBreakerErrorThreshold: number = 5;
  private circuitBreakerWindowMs: number = 5 * 60 * 1000; // 5 minutes
  private circuitBreaker: CircuitBreakerState;

  constructor(maxLeverage: number, maxTotalNotional: number, cooldownMs: number) {
    this.maxLeverage = maxLeverage;
    this.maxTotalNotional = maxTotalNotional;
    this.cooldownMs = cooldownMs;
    this.panicMode = false;
    this.autoTradingDisabled = false;
    this.lastExecByCoin = new Map();
    this.circuitBreaker = {
      errorCount: 0,
      windowStart: Date.now(),
    };
  }

  /**
   * Check if an order passes all risk checks
   */
  checkOrder(
    order: OrderRequest,
    currentPositions: Position[],
    currentTotalNotional: number,
    markPrice: number,
  ): RiskCheckResult {
    // 1. PANIC mode check
    if (this.panicMode && !order.reduceOnly) {
      return { allowed: false, reason: 'PANIC mode active - only reduce-only orders allowed' };
    }

    // 2. Auto-trading disabled (circuit breaker)
    if (this.autoTradingDisabled && !order.reduceOnly) {
      return { allowed: false, reason: 'Auto-trading disabled by circuit breaker' };
    }

    // 3. Cooldown check
    const lastExec = this.lastExecByCoin.get(order.coin) || 0;
    const timeSinceLastExec = Date.now() - lastExec;
    if (timeSinceLastExec < this.cooldownMs) {
      return {
        allowed: false,
        reason: `Cooldown active for ${order.coin} (${this.cooldownMs - timeSinceLastExec}ms remaining)`,
      };
    }

    // 4. Max total notional check
    if (!order.reduceOnly) {
      const orderNotional = order.size * markPrice;
      const projectedTotalNotional = currentTotalNotional + orderNotional;

      if (projectedTotalNotional > this.maxTotalNotional) {
        return {
          allowed: false,
          reason: `Max total notional exceeded: ${projectedTotalNotional.toFixed(2)} > ${this.maxTotalNotional}`,
        };
      }
    }

    // 5. Max leverage check (approximate)
    // TODO: This is a simplified check. Actual leverage depends on margin mode and collateral.
    // For now, we check if position size * price would exceed leverage cap
    if (!order.reduceOnly) {
      const currentPosition = currentPositions.find(p => p.coin === order.coin);
      const currentSize = currentPosition?.size || 0;
      const newSize = order.side === 'buy' ? currentSize + order.size : currentSize - order.size;
      const newNotional = Math.abs(newSize) * markPrice;

      // Approximate leverage check (assumes marginUsed is available)
      const marginUsed = currentPosition?.marginUsed || newNotional / this.maxLeverage;
      const projectedLeverage = newNotional / marginUsed;

      if (projectedLeverage > this.maxLeverage) {
        logger.warn(
          { coin: order.coin, projectedLeverage, maxLeverage: this.maxLeverage },
          'Leverage check - approximation may be inaccurate',
        );
        return {
          allowed: false,
          reason: `Max leverage exceeded for ${order.coin}: ${projectedLeverage.toFixed(2)} > ${this.maxLeverage}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record successful execution (updates cooldown)
   */
  recordExecution(coin: string): void {
    this.lastExecByCoin.set(coin, Date.now());
    logger.debug({ coin }, 'Recorded execution timestamp');
  }

  /**
   * Record execution error (feeds circuit breaker)
   */
  recordError(): void {
    const now = Date.now();

    // Reset window if needed
    if (now - this.circuitBreaker.windowStart > this.circuitBreakerWindowMs) {
      this.circuitBreaker.errorCount = 0;
      this.circuitBreaker.windowStart = now;
    }

    this.circuitBreaker.errorCount++;

    logger.warn(
      {
        errorCount: this.circuitBreaker.errorCount,
        threshold: this.circuitBreakerErrorThreshold,
      },
      'Execution error recorded',
    );

    // Trigger circuit breaker if threshold exceeded
    if (this.circuitBreaker.errorCount >= this.circuitBreakerErrorThreshold) {
      this.autoTradingDisabled = true;
      logger.error('Circuit breaker triggered - auto-trading disabled');
    }
  }

  /**
   * Enable PANIC mode (blocks all trading, only reduce-only orders allowed)
   */
  enablePanicMode(): void {
    this.panicMode = true;
    logger.warn('PANIC mode enabled');
  }

  /**
   * Disable PANIC mode
   */
  disablePanicMode(): void {
    this.panicMode = false;
    logger.info('PANIC mode disabled');
  }

  /**
   * Re-enable auto-trading (reset circuit breaker)
   */
  resetCircuitBreaker(): void {
    this.autoTradingDisabled = false;
    this.circuitBreaker.errorCount = 0;
    this.circuitBreaker.windowStart = Date.now();
    logger.info('Circuit breaker reset - auto-trading re-enabled');
  }

  /**
   * Update risk parameters
   */
  updateParams(params: {
    maxLeverage?: number;
    maxTotalNotional?: number;
    cooldownMs?: number;
  }): void {
    if (params.maxLeverage !== undefined) {
      this.maxLeverage = params.maxLeverage;
    }
    if (params.maxTotalNotional !== undefined) {
      this.maxTotalNotional = params.maxTotalNotional;
    }
    if (params.cooldownMs !== undefined) {
      this.cooldownMs = params.cooldownMs;
    }
    logger.info({ params }, 'Risk parameters updated');
  }

  /**
   * Get current state
   */
  getState(): {
    panicMode: boolean;
    autoTradingDisabled: boolean;
    maxLeverage: number;
    maxTotalNotional: number;
    cooldownMs: number;
    circuitBreakerErrors: number;
  } {
    return {
      panicMode: this.panicMode,
      autoTradingDisabled: this.autoTradingDisabled,
      maxLeverage: this.maxLeverage,
      maxTotalNotional: this.maxTotalNotional,
      cooldownMs: this.cooldownMs,
      circuitBreakerErrors: this.circuitBreaker.errorCount,
    };
  }

  /**
   * Get cooldown remaining for a coin (in ms)
   */
  getCooldownRemaining(coin: string): number {
    const lastExec = this.lastExecByCoin.get(coin) || 0;
    const elapsed = Date.now() - lastExec;
    return Math.max(0, this.cooldownMs - elapsed);
  }
}
