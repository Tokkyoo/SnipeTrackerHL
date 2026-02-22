import { RiskEngine } from '../src/core/riskEngine';
import { OrderRequest, Position } from '../src/core/positionModel';

describe('RiskEngine', () => {
  let riskEngine: RiskEngine;

  beforeEach(() => {
    riskEngine = new RiskEngine(5, 2000, 2000); // maxLev=5, maxNotional=2000, cooldown=2s
  });

  describe('checkOrder', () => {
    it('should allow order when all checks pass', () => {
      const order: OrderRequest = {
        coin: 'BTC',
        side: 'buy',
        size: 0.1,
        tif: 'IOC',
        reduceOnly: false,
      };

      const result = riskEngine.checkOrder(order, [], 500, 50000);

      expect(result.allowed).toBe(true);
    });

    it('should reject order when in panic mode', () => {
      riskEngine.enablePanicMode();

      const order: OrderRequest = {
        coin: 'BTC',
        side: 'buy',
        size: 0.1,
        tif: 'IOC',
        reduceOnly: false,
      };

      const result = riskEngine.checkOrder(order, [], 500, 50000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('PANIC');
    });

    it('should allow reduce-only orders in panic mode', () => {
      riskEngine.enablePanicMode();

      const order: OrderRequest = {
        coin: 'BTC',
        side: 'sell',
        size: 0.1,
        tif: 'IOC',
        reduceOnly: true,
      };

      const result = riskEngine.checkOrder(order, [], 500, 50000);

      expect(result.allowed).toBe(true);
    });

    it('should reject order when cooldown is active', () => {
      const order: OrderRequest = {
        coin: 'BTC',
        side: 'buy',
        size: 0.1,
        tif: 'IOC',
        reduceOnly: false,
      };

      // Record execution
      riskEngine.recordExecution('BTC');

      // Immediately try again
      const result = riskEngine.checkOrder(order, [], 500, 50000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cooldown');
    });

    it('should allow order after cooldown expires', async () => {
      const riskEngineShortCooldown = new RiskEngine(5, 2000, 100); // 100ms cooldown

      const order: OrderRequest = {
        coin: 'BTC',
        side: 'buy',
        size: 0.1,
        tif: 'IOC',
        reduceOnly: false,
      };

      riskEngineShortCooldown.recordExecution('BTC');

      // Wait for cooldown to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const result = riskEngineShortCooldown.checkOrder(order, [], 500, 50000);

      expect(result.allowed).toBe(true);
    });

    it('should reject order when max total notional exceeded', () => {
      const order: OrderRequest = {
        coin: 'BTC',
        side: 'buy',
        size: 0.1,
        tif: 'IOC',
        reduceOnly: false,
      };

      // Current notional = 1900, order notional = 0.1 * 50000 = 5000 -> total = 6900 > 2000
      const result = riskEngine.checkOrder(order, [], 1900, 50000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('notional');
    });

    it('should allow reduce-only orders regardless of notional', () => {
      const order: OrderRequest = {
        coin: 'BTC',
        side: 'sell',
        size: 1,
        tif: 'IOC',
        reduceOnly: true,
      };

      const result = riskEngine.checkOrder(order, [], 1900, 50000);

      expect(result.allowed).toBe(true);
    });

    it('should reject order when circuit breaker is tripped', () => {
      // Trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        riskEngine.recordError();
      }

      const order: OrderRequest = {
        coin: 'BTC',
        side: 'buy',
        size: 0.1,
        tif: 'IOC',
        reduceOnly: false,
      };

      const result = riskEngine.checkOrder(order, [], 500, 50000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('circuit breaker');
    });
  });

  describe('panic mode', () => {
    it('should enable and disable panic mode', () => {
      expect(riskEngine.getState().panicMode).toBe(false);

      riskEngine.enablePanicMode();
      expect(riskEngine.getState().panicMode).toBe(true);

      riskEngine.disablePanicMode();
      expect(riskEngine.getState().panicMode).toBe(false);
    });
  });

  describe('circuit breaker', () => {
    it('should trip after threshold errors', () => {
      expect(riskEngine.getState().autoTradingDisabled).toBe(false);

      for (let i = 0; i < 5; i++) {
        riskEngine.recordError();
      }

      expect(riskEngine.getState().autoTradingDisabled).toBe(true);
    });

    it('should reset circuit breaker', () => {
      for (let i = 0; i < 5; i++) {
        riskEngine.recordError();
      }

      expect(riskEngine.getState().autoTradingDisabled).toBe(true);

      riskEngine.resetCircuitBreaker();
      expect(riskEngine.getState().autoTradingDisabled).toBe(false);
      expect(riskEngine.getState().circuitBreakerErrors).toBe(0);
    });
  });

  describe('updateParams', () => {
    it('should update risk parameters', () => {
      riskEngine.updateParams({
        maxLeverage: 10,
        maxTotalNotional: 5000,
        cooldownMs: 1000,
      });

      const state = riskEngine.getState();
      expect(state.maxLeverage).toBe(10);
      expect(state.maxTotalNotional).toBe(5000);
      expect(state.cooldownMs).toBe(1000);
    });
  });

  describe('getCooldownRemaining', () => {
    it('should return remaining cooldown time', () => {
      riskEngine.recordExecution('BTC');

      const remaining = riskEngine.getCooldownRemaining('BTC');
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(2000);
    });

    it('should return 0 for coins never executed', () => {
      const remaining = riskEngine.getCooldownRemaining('ETH');
      expect(remaining).toBe(0);
    });
  });
});
