import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

/**
 * Trade record for performance tracking
 */
export interface TradeRecord {
  coin: string;
  side: 'long' | 'short';
  entryTime: number;
  exitTime?: number;
  entrySize: number;
  exitSize?: number;
  entryPrice?: number;
  exitPrice?: number;
  pnl?: number;
  isOpen: boolean;
}

/**
 * Performance metrics for a leader
 */
export interface LeaderPerformance {
  address: string;
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  bestTrade: number;
  worstTrade: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  lastTradeTime: number;
  trades: TradeRecord[];
}

/**
 * Alert configuration
 */
export interface Alert {
  id: string;
  type: 'coin' | 'leader-coin';
  coin: string;
  leader?: string; // Optional: specific leader address
  createdAt: number;
}

/**
 * Daily summary data
 */
export interface DailySummary {
  date: string; // YYYY-MM-DD
  totalTrades: number;
  leaderStats: Record<string, { trades: number; pnl: number }>;
  topCoins: Array<{ coin: string; count: number }>;
}

/**
 * Runtime state that can be persisted
 */
export interface AppState {
  enabled: boolean;
  panic: boolean;
  ratio: number;
  notionalCap: number;
  maxLeverage: number;
  maxTotalNotional: number;
  tif: 'IOC' | 'GTC';
  cooldownMs: number;
  copyMode: 'full' | 'entry-only' | 'signals-only';
  leaders: string[];
  leaderNicknames: Record<string, string>; // address -> nickname
  leaderPerformance: Record<string, LeaderPerformance>; // address -> performance
  lastExecByCoin: Record<string, number>;
  alerts: Alert[]; // Custom alerts
  dailySummaries: Record<string, DailySummary>; // date -> summary
  lastDailySummary: number; // timestamp of last summary sent
  counters: {
    execCount: number;
    rejectCount: number;
    errorCount: number;
  };
}

/**
 * StateStore manages in-memory state with optional persistence to disk
 */
export class StateStore {
  private state: AppState;
  private stateFile: string;
  private persistEnabled: boolean;

  constructor(initialState: Partial<AppState>, stateFile: string = 'state.json') {
    this.stateFile = stateFile;
    this.persistEnabled = true;

    // Try to load existing state
    const loadedState = this.loadFromDisk();

    this.state = {
      enabled: initialState.enabled ?? loadedState?.enabled ?? false,
      panic: initialState.panic ?? loadedState?.panic ?? false,
      ratio: initialState.ratio ?? loadedState?.ratio ?? 0.2,
      notionalCap: initialState.notionalCap ?? loadedState?.notionalCap ?? 200,
      maxLeverage: initialState.maxLeverage ?? loadedState?.maxLeverage ?? 5,
      maxTotalNotional: initialState.maxTotalNotional ?? loadedState?.maxTotalNotional ?? 2000,
      tif: initialState.tif ?? loadedState?.tif ?? 'IOC',
      cooldownMs: initialState.cooldownMs ?? loadedState?.cooldownMs ?? 2000,
      copyMode: initialState.copyMode ?? loadedState?.copyMode ?? 'entry-only',
      leaders: initialState.leaders ?? loadedState?.leaders ?? [],
      leaderNicknames: initialState.leaderNicknames ?? loadedState?.leaderNicknames ?? {},
      leaderPerformance: initialState.leaderPerformance ?? loadedState?.leaderPerformance ?? {},
      lastExecByCoin: initialState.lastExecByCoin ?? loadedState?.lastExecByCoin ?? {},
      alerts: initialState.alerts ?? loadedState?.alerts ?? [],
      dailySummaries: initialState.dailySummaries ?? loadedState?.dailySummaries ?? {},
      lastDailySummary: initialState.lastDailySummary ?? loadedState?.lastDailySummary ?? 0,
      counters: initialState.counters ?? loadedState?.counters ?? {
        execCount: 0,
        rejectCount: 0,
        errorCount: 0,
      },
    };

    logger.info({ stateFile: this.stateFile, loaded: !!loadedState }, 'StateStore initialized');
  }

  /**
   * Get current state snapshot
   */
  getState(): AppState {
    return { ...this.state };
  }

  /**
   * Update state and persist
   */
  setState(updates: Partial<AppState>): void {
    this.state = { ...this.state, ...updates };
    this.persist();
  }

  /**
   * Update a specific field
   */
  set<K extends keyof AppState>(key: K, value: AppState[K]): void {
    this.state[key] = value;
    this.persist();
  }

  /**
   * Get a specific field
   */
  get<K extends keyof AppState>(key: K): AppState[K] {
    return this.state[key];
  }

  /**
   * Increment a counter
   */
  incrementCounter(counter: keyof AppState['counters']): void {
    this.state.counters[counter]++;
    this.persist();
  }

  /**
   * Set nickname for a leader
   */
  setLeaderNickname(address: string, nickname: string): void {
    this.state.leaderNicknames[address.toLowerCase()] = nickname;
    this.persist();
  }

  /**
   * Get nickname for a leader
   */
  getLeaderNickname(address: string): string | undefined {
    return this.state.leaderNicknames[address.toLowerCase()];
  }

  /**
   * Remove nickname for a leader
   */
  removeLeaderNickname(address: string): void {
    delete this.state.leaderNicknames[address.toLowerCase()];
    this.persist();
  }

  /**
   * Get or initialize leader performance
   */
  getLeaderPerformance(address: string): LeaderPerformance {
    const addr = address.toLowerCase();
    if (!this.state.leaderPerformance[addr]) {
      this.state.leaderPerformance[addr] = {
        address: addr,
        totalTrades: 0,
        openTrades: 0,
        closedTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalPnl: 0,
        bestTrade: 0,
        worstTrade: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        lastTradeTime: 0,
        trades: [],
      };
    }
    return this.state.leaderPerformance[addr];
  }

  /**
   * Record a new trade opening
   */
  recordTradeOpen(leader: string, coin: string, side: 'long' | 'short', size: number, price?: number): void {
    const perf = this.getLeaderPerformance(leader);
    
    perf.trades.push({
      coin,
      side,
      entryTime: Date.now(),
      entrySize: size,
      entryPrice: price,
      isOpen: true,
    });
    
    perf.totalTrades++;
    perf.openTrades++;
    perf.lastTradeTime = Date.now();
    
    this.persist();
  }

  /**
   * Record a trade closing
   */
  recordTradeClose(leader: string, coin: string, exitSize: number, exitPrice?: number, pnl?: number): void {
    const perf = this.getLeaderPerformance(leader);
    
    // Find the open trade for this coin
    const trade = perf.trades.find(t => t.coin === coin && t.isOpen);
    if (!trade) {
      logger.warn({ leader, coin }, 'No open trade found to close');
      return;
    }

    trade.isOpen = false;
    trade.exitTime = Date.now();
    trade.exitSize = exitSize;
    trade.exitPrice = exitPrice;
    trade.pnl = pnl;

    perf.openTrades--;
    perf.closedTrades++;
    
    if (pnl !== undefined) {
      perf.totalPnl += pnl;
      
      if (pnl > 0) {
        perf.winningTrades++;
        if (pnl > perf.bestTrade) perf.bestTrade = pnl;
      } else if (pnl < 0) {
        perf.losingTrades++;
        if (pnl < perf.worstTrade) perf.worstTrade = pnl;
      }

      // Recalculate metrics
      this.recalculateMetrics(perf);
    }
    
    this.persist();
  }

  /**
   * Recalculate performance metrics
   */
  private recalculateMetrics(perf: LeaderPerformance): void {
    const closedTrades = perf.trades.filter(t => !t.isOpen && t.pnl !== undefined);
    
    if (closedTrades.length === 0) return;

    perf.winRate = perf.closedTrades > 0 ? (perf.winningTrades / perf.closedTrades) * 100 : 0;

    const wins = closedTrades.filter(t => t.pnl! > 0);
    const losses = closedTrades.filter(t => t.pnl! < 0);

    perf.avgWin = wins.length > 0 
      ? wins.reduce((sum, t) => sum + t.pnl!, 0) / wins.length 
      : 0;
    
    perf.avgLoss = losses.length > 0 
      ? Math.abs(losses.reduce((sum, t) => sum + t.pnl!, 0) / losses.length)
      : 0;

    perf.profitFactor = perf.avgLoss > 0 
      ? (perf.avgWin * wins.length) / (perf.avgLoss * losses.length)
      : 0;
  }

  /**
   * Get all leader performances
   */
  getAllLeaderPerformances(): Record<string, LeaderPerformance> {
    return { ...this.state.leaderPerformance };
  }

  /**
   * Record execution timestamp for a coin
   */
  recordExecution(coin: string): void {
    this.state.lastExecByCoin[coin] = Date.now();
    this.persist();
  }

  /**
   * Persist state to disk
   */
  private persist(): void {
    if (!this.persistEnabled) return;

    try {
      // Reload leaders and nicknames from disk to preserve external changes
      const existingState = this.loadFromDisk();
      if (existingState) {
        this.state.leaders = existingState.leaders || this.state.leaders;
        this.state.leaderNicknames = existingState.leaderNicknames || this.state.leaderNicknames;
      }
      
      const json = JSON.stringify(this.state, null, 2);
      fs.writeFileSync(this.stateFile, json, 'utf-8');
      logger.debug({ stateFile: this.stateFile }, 'State persisted to disk');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to persist state to disk');
    }
  }

  /**
   * Load state from disk
   */
  private loadFromDisk(): AppState | null {
    try {
      if (!fs.existsSync(this.stateFile)) {
        logger.info('No existing state file found');
        return null;
      }

      const json = fs.readFileSync(this.stateFile, 'utf-8');
      const state = JSON.parse(json) as AppState;
      logger.info({ stateFile: this.stateFile }, 'State loaded from disk');
      return state;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to load state from disk');
      return null;
    }
  }

  /**
   * Add an alert
   */
  addAlert(alert: Omit<Alert, 'id' | 'createdAt'>): Alert {
    const newAlert: Alert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
    };
    this.state.alerts.push(newAlert);
    this.persist();
    return newAlert;
  }

  /**
   * Remove an alert by id
   */
  removeAlert(id: string): boolean {
    const index = this.state.alerts.findIndex(a => a.id === id);
    if (index !== -1) {
      this.state.alerts.splice(index, 1);
      this.persist();
      return true;
    }
    return false;
  }

  /**
   * Get all alerts
   */
  getAlerts(): Alert[] {
    return [...this.state.alerts];
  }

  /**
   * Check if a position matches any alert
   */
  matchesAlert(coin: string, leader: string): Alert | undefined {
    coin = coin.toLowerCase();
    leader = leader.toLowerCase();
    
    return this.state.alerts.find(alert => {
      if (alert.type === 'coin') {
        return alert.coin.toLowerCase() === coin;
      } else if (alert.type === 'leader-coin') {
        return alert.coin.toLowerCase() === coin && alert.leader?.toLowerCase() === leader;
      }
      return false;
    });
  }

  /**
   * Record daily summary
   */
  recordDailySummary(date: string, summary: DailySummary): void {
    this.state.dailySummaries[date] = summary;
    this.state.lastDailySummary = Date.now();
    this.persist();
  }

  /**
   * Get daily summary for a date
   */
  getDailySummary(date: string): DailySummary | undefined {
    return this.state.dailySummaries[date];
  }

  /**
   * Get last daily summary timestamp
   */
  getLastDailySummaryTime(): number {
    return this.state.lastDailySummary;
  }

  /**
   * Disable persistence (for testing)
   */
  disablePersistence(): void {
    this.persistEnabled = false;
  }
}
