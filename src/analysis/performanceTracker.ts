import { Position } from '../core/positionModel';
import { StateStore } from '../store/stateStore';
import { logger } from '../utils/logger';

/**
 * PerformanceTracker monitors leader positions and tracks performance
 */
export class PerformanceTracker {
  private stateStore: StateStore;
  private previousPositions: Map<string, Map<string, Position>>; // leader -> (coin -> position)

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
    this.previousPositions = new Map();
  }

  /**
   * Update tracking with current positions
   */
  updatePositions(leader: string, currentPositions: Position[]): void {
    const addr = leader.toLowerCase();
    const prevPositionsMap = this.previousPositions.get(addr) || new Map();
    const currentPositionsMap = new Map(currentPositions.map(p => [p.coin, p]));

    // Detect new positions (trades opened)
    for (const pos of currentPositions) {
      const prevPos = prevPositionsMap.get(pos.coin);
      
      if (!prevPos) {
        // New position opened
        const side = pos.size > 0 ? 'long' : 'short';
        this.stateStore.recordTradeOpen(addr, pos.coin, side, Math.abs(pos.size), pos.entryPx);
        logger.info({ leader: addr, coin: pos.coin, side, size: pos.size }, 'Trade opened - tracking');
      }
    }

    // Detect closed positions
    for (const [coin, prevPos] of prevPositionsMap) {
      if (!currentPositionsMap.has(coin)) {
        // Position closed
        const pnl = prevPos.unrealizedPnl || 0;
        this.stateStore.recordTradeClose(addr, coin, Math.abs(prevPos.size), prevPos.entryPx, pnl);
        logger.info({ leader: addr, coin, pnl }, 'Trade closed - tracking');
      }
    }

    // Update cache
    this.previousPositions.set(addr, currentPositionsMap);
  }

  /**
   * Get performance summary for a leader
   */
  getPerformanceSummary(leader: string): string {
    const perf = this.stateStore.getLeaderPerformance(leader);
    const nickname = this.stateStore.getLeaderNickname(leader);
    const displayName = nickname || `${leader.slice(0, 6)}...${leader.slice(-4)}`;

    if (perf.totalTrades === 0) {
      return `**${displayName}**\n📊 No trades yet`;
    }

    const winRateEmoji = perf.winRate >= 60 ? '🟢' : perf.winRate >= 40 ? '🟡' : '🔴';
    const pnlEmoji = perf.totalPnl >= 0 ? '💚' : '❤️';

    return `
**${displayName}**

📊 **Stats:**
• Total Trades: ${perf.totalTrades} (${perf.openTrades} open)
• Closed: ${perf.closedTrades}
${winRateEmoji} Win Rate: ${perf.winRate.toFixed(1)}% (${perf.winningTrades}W / ${perf.losingTrades}L)

💰 **P&L:**
${pnlEmoji} Total: ${perf.totalPnl >= 0 ? '+' : ''}$${perf.totalPnl.toFixed(2)}
📈 Best: +$${perf.bestTrade.toFixed(2)}
📉 Worst: $${perf.worstTrade.toFixed(2)}

📐 **Metrics:**
• Avg Win: +$${perf.avgWin.toFixed(2)}
• Avg Loss: -$${perf.avgLoss.toFixed(2)}
• Profit Factor: ${perf.profitFactor.toFixed(2)}x
    `.trim();
  }

  /**
   * Get performance rankings
   */
  getRankings(): Array<{ leader: string; pnl: number; winRate: number; trades: number }> {
    const allPerf = this.stateStore.getAllLeaderPerformances();
    
    return Object.values(allPerf)
      .filter(p => p.closedTrades > 0)
      .map(p => ({
        leader: p.address,
        pnl: p.totalPnl,
        winRate: p.winRate,
        trades: p.closedTrades,
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }

  /**
   * Get recommendations based on performance
   */
  getRecommendations(): string[] {
    const rankings = this.getRankings();
    const recommendations: string[] = [];

    for (const rank of rankings) {
      const nickname = this.stateStore.getLeaderNickname(rank.leader);
      const displayName = nickname || `${rank.leader.slice(0, 6)}...${rank.leader.slice(-4)}`;

      if (rank.trades < 5) {
        recommendations.push(`⏳ ${displayName}: Not enough data (${rank.trades} trades)`);
        continue;
      }

      if (rank.pnl < -100 && rank.winRate < 40) {
        recommendations.push(`🔴 ${displayName}: Poor performance (${rank.pnl.toFixed(0)}$ / ${rank.winRate.toFixed(0)}% WR) - Consider removing`);
      } else if (rank.pnl > 500 && rank.winRate > 55) {
        recommendations.push(`🟢 ${displayName}: Excellent performance (${rank.pnl.toFixed(0)}$ / ${rank.winRate.toFixed(0)}% WR) - Consider increasing ratio`);
      } else if (rank.winRate < 35) {
        recommendations.push(`⚠️ ${displayName}: Low win rate (${rank.winRate.toFixed(0)}%) - Monitor closely`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ All leaders performing within normal range');
    }

    return recommendations;
  }
}
