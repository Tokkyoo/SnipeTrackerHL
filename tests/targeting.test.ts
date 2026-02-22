import { Targeting } from '../src/core/targeting';
import { Position } from '../src/core/positionModel';

describe('Targeting', () => {
  let targeting: Targeting;

  beforeEach(() => {
    targeting = new Targeting();
  });

  describe('calculateTarget', () => {
    it('should calculate target size based on ratio', () => {
      const target = targeting.calculateTarget(10, 0, 0.2);
      expect(target.targetSize).toBe(2);
      expect(target.currentSize).toBe(0);
      expect(target.delta).toBe(2);
    });

    it('should calculate negative delta when reducing position', () => {
      const target = targeting.calculateTarget(5, 10, 0.5);
      expect(target.targetSize).toBe(2.5);
      expect(target.currentSize).toBe(10);
      expect(target.delta).toBe(-7.5);
    });

    it('should handle zero leader size', () => {
      const target = targeting.calculateTarget(0, 5, 0.2);
      expect(target.targetSize).toBe(0);
      expect(target.delta).toBe(-5);
    });

    it('should handle negative (short) positions', () => {
      const target = targeting.calculateTarget(-10, 0, 0.2);
      expect(target.targetSize).toBe(-2);
      expect(target.delta).toBe(-2);
    });
  });

  describe('computeTargets', () => {
    it('should compute targets for all coins', () => {
      const aggregatedLeader = new Map<string, Position>([
        ['BTC', { coin: 'BTC', size: 10, updatedAt: Date.now() }],
        ['ETH', { coin: 'ETH', size: 20, updatedAt: Date.now() }],
      ]);

      const followerPositions = new Map<string, Position>([
        ['BTC', { coin: 'BTC', size: 1, updatedAt: Date.now() }],
      ]);

      const targets = targeting.computeTargets(aggregatedLeader, followerPositions, 0.2);

      expect(targets).toHaveLength(2);
      
      const btcTarget = targets.find(t => t.coin === 'BTC');
      expect(btcTarget).toBeDefined();
      expect(btcTarget!.targetSize).toBe(2);
      expect(btcTarget!.delta).toBe(1);

      const ethTarget = targets.find(t => t.coin === 'ETH');
      expect(ethTarget).toBeDefined();
      expect(ethTarget!.targetSize).toBe(4);
      expect(ethTarget!.delta).toBe(4);
    });

    it('should include coins that need to be closed', () => {
      const aggregatedLeader = new Map<string, Position>();

      const followerPositions = new Map<string, Position>([
        ['BTC', { coin: 'BTC', size: 5, updatedAt: Date.now() }],
      ]);

      const targets = targeting.computeTargets(aggregatedLeader, followerPositions, 0.2);

      expect(targets).toHaveLength(1);
      expect(targets[0].coin).toBe('BTC');
      expect(targets[0].targetSize).toBe(0);
      expect(targets[0].delta).toBe(-5);
    });

    it('should not include targets with negligible delta', () => {
      const aggregatedLeader = new Map<string, Position>([
        ['BTC', { coin: 'BTC', size: 10, updatedAt: Date.now() }],
      ]);

      const followerPositions = new Map<string, Position>([
        ['BTC', { coin: 'BTC', size: 2, updatedAt: Date.now() }],
      ]);

      const targets = targeting.computeTargets(aggregatedLeader, followerPositions, 0.2);

      // Target = 10 * 0.2 = 2, current = 2, delta = 0
      expect(targets).toHaveLength(0);
    });
  });

  describe('generateOrders', () => {
    it('should generate a single buy order for positive delta', () => {
      const target = {
        coin: 'BTC',
        targetSize: 2,
        currentSize: 0,
        delta: 2,
      };

      const orders = targeting.generateOrders(target, 50000, 200, 'IOC');

      expect(orders).toHaveLength(1);
      expect(orders[0].coin).toBe('BTC');
      expect(orders[0].side).toBe('buy');
      expect(orders[0].size).toBe(2);
      expect(orders[0].tif).toBe('IOC');
      expect(orders[0].reduceOnly).toBe(false);
    });

    it('should generate a single sell order for negative delta', () => {
      const target = {
        coin: 'BTC',
        targetSize: 0,
        currentSize: 2,
        delta: -2,
      };

      const orders = targeting.generateOrders(target, 50000, 200, 'GTC');

      expect(orders).toHaveLength(1);
      expect(orders[0].side).toBe('sell');
      expect(orders[0].size).toBe(2);
      expect(orders[0].tif).toBe('GTC');
      expect(orders[0].reduceOnly).toBe(true); // Reducing position
    });

    it('should chunk orders when exceeding notional cap', () => {
      const target = {
        coin: 'BTC',
        targetSize: 10,
        currentSize: 0,
        delta: 10,
      };

      // Mark price = 50000, cap = 100000 -> max 2 BTC per order
      const orders = targeting.generateOrders(target, 50000, 100000, 'IOC');

      expect(orders.length).toBeGreaterThan(1);
      
      // Total size should equal delta
      const totalSize = orders.reduce((sum, o) => sum + o.size, 0);
      expect(totalSize).toBeCloseTo(10, 4);

      // Each order should be <= cap
      for (const order of orders) {
        expect(order.size * 50000).toBeLessThanOrEqual(100000 + 0.01);
      }
    });

    it('should set reduceOnly=true when reducing a long position', () => {
      const target = {
        coin: 'BTC',
        targetSize: 5,
        currentSize: 10,
        delta: -5,
      };

      const orders = targeting.generateOrders(target, 50000, 200, 'IOC');

      expect(orders).toHaveLength(1);
      expect(orders[0].side).toBe('sell');
      expect(orders[0].reduceOnly).toBe(true);
    });

    it('should set reduceOnly=true when reducing a short position', () => {
      const target = {
        coin: 'BTC',
        targetSize: -5,
        currentSize: -10,
        delta: 5,
      };

      const orders = targeting.generateOrders(target, 50000, 200, 'IOC');

      expect(orders).toHaveLength(1);
      expect(orders[0].side).toBe('buy');
      expect(orders[0].reduceOnly).toBe(true);
    });

    it('should set reduceOnly=false when opening a new position', () => {
      const target = {
        coin: 'BTC',
        targetSize: 5,
        currentSize: 0,
        delta: 5,
      };

      const orders = targeting.generateOrders(target, 50000, 200, 'IOC');

      expect(orders[0].reduceOnly).toBe(false);
    });

    it('should set reduceOnly=false when increasing an existing position', () => {
      const target = {
        coin: 'BTC',
        targetSize: 10,
        currentSize: 5,
        delta: 5,
      };

      const orders = targeting.generateOrders(target, 50000, 200, 'IOC');

      expect(orders[0].reduceOnly).toBe(false);
    });
  });
});
