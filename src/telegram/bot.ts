import TelegramBot from 'node-telegram-bot-api';
import { CopyTradingLoop, PositionChange } from '../core/loop';
import { RiskEngine } from '../core/riskEngine';
import { Executor } from '../core/executor';
import { ExchangeClient } from '../hyperliquid/exchangeClient';
import { InfoClient } from '../hyperliquid/infoClient';
import { TraderAnalyzer } from '../analysis/traderAnalyzer';
import { PerformanceTracker } from '../analysis/performanceTracker';
import { StateStore } from '../store/stateStore';
import { logger } from '../utils/logger';

/**
 * TelegramBotController provides Telegram-based control interface
 */
export class TelegramBotController {
  private bot: TelegramBot;
  private allowedChatIds: Set<number>;
  private loop: CopyTradingLoop;
  private riskEngine: RiskEngine;
  private executor: Executor;
  private exchangeClient: ExchangeClient;
  private infoClient: InfoClient;
  private followerAddress: string;
  private traderAnalyzer: TraderAnalyzer;
  private stateStore: StateStore;
  private performanceTracker: PerformanceTracker;
  private lastNotificationTime: Map<string, number>; // coin -> timestamp
  private notificationCooldown: number = 60000; // 1 minute cooldown per coin

  constructor(
    token: string,
    allowedChatIds: number[],
    loop: CopyTradingLoop,
    riskEngine: RiskEngine,
    executor: Executor,
    exchangeClient: ExchangeClient,
    infoClient: InfoClient,
    followerAddress: string,
    stateStore: StateStore,
  ) {
    this.bot = new TelegramBot(token, { polling: true });
    this.allowedChatIds = new Set(allowedChatIds);
    this.loop = loop;
    this.riskEngine = riskEngine;
    this.executor = executor;
    this.exchangeClient = exchangeClient;
    this.infoClient = infoClient;
    this.traderAnalyzer = new TraderAnalyzer(infoClient);
    this.followerAddress = followerAddress;
    this.stateStore = stateStore;
    this.performanceTracker = new PerformanceTracker(stateStore);
    this.lastNotificationTime = new Map();

    this.registerCommands();
    this.setupPositionMonitoring();
    this.setupDailySummary();
    logger.info({ allowedChatIds }, 'Telegram bot initialized');
  }

  /**
   * Setup daily summary timer
   */
  private setupDailySummary(): void {
    // Check every hour if we need to send daily summary
    setInterval(() => {
      this.checkAndSendDailySummary();
    }, 60 * 60 * 1000); // 1 hour
    
    // Also check on startup
    setTimeout(() => this.checkAndSendDailySummary(), 5000);
  }

  /**
   * Check if daily summary should be sent and send it
   */
  private async checkAndSendDailySummary(): Promise<void> {
    const now = Date.now();
    const lastSummary = this.stateStore.getLastDailySummaryTime();
    const hoursSinceLastSummary = (now - lastSummary) / (1000 * 60 * 60);
    
    // Send summary once per day (at least 20 hours since last one)
    if (hoursSinceLastSummary < 20) {
      return;
    }
    
    const config = this.loop.getConfig();
    if (config.leaderAddresses.length === 0) {
      return; // No leaders to summarize
    }
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Gather stats from last 24 hours
      const leaderStats: Record<string, { trades: number; pnl: number; positions: number }> = {};
      const coinCounts: Record<string, number> = {};
      let totalTrades = 0;
      
      for (const leader of config.leaderAddresses) {
        const perf = this.stateStore.getLeaderPerformance(leader);
        const recentTrades = perf.trades.filter(t => t.entryTime > now - 24 * 60 * 60 * 1000);
        
        leaderStats[leader] = {
          trades: recentTrades.length,
          pnl: recentTrades.filter(t => !t.isOpen).reduce((sum, t) => sum + (t.pnl || 0), 0),
          positions: recentTrades.filter(t => t.isOpen).length,
        };
        
        totalTrades += recentTrades.length;
        
        // Count coins
        for (const trade of recentTrades) {
          coinCounts[trade.coin] = (coinCounts[trade.coin] || 0) + 1;
        }
      }
      
      // Skip if no activity
      if (totalTrades === 0) {
        return;
      }
      
      // Sort top coins
      const topCoins = Object.entries(coinCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([coin, count]) => ({ coin, count }));
      
      // Build summary message
      const lines = [
        '📈 **Daily Summary** 📈',
        `📅 ${yesterday}`,
        '',
        `📊 **Total Activity:** ${totalTrades} trades`,
        '',
        '👥 **Leader Performance:**',
      ];
      
      for (const leader of config.leaderAddresses) {
        const stats = leaderStats[leader];
        if (stats.trades === 0) continue;
        
        const nickname = this.stateStore.getLeaderNickname(leader);
        const displayName = nickname || `${leader.slice(0, 10)}...`;
        const pnlEmoji = stats.pnl >= 0 ? '💰' : '💸';
        
        lines.push(`\n**${displayName}**`);
        lines.push(`   Trades: ${stats.trades} | Open: ${stats.positions}`);
        if (stats.pnl !== 0) {
          lines.push(`   ${pnlEmoji} PnL: $${stats.pnl.toFixed(2)}`);
        }
      }
      
      if (topCoins.length > 0) {
        lines.push('', '🔥 **Most Traded Coins:**');
        topCoins.forEach((item, i) => {
          lines.push(`${i + 1}. ${item.coin} (${item.count} trades)`);
        });
      }
      
      lines.push('', '💡 Use /leaderperf to see detailed stats');
      
      // Record summary
      this.stateStore.recordDailySummary(yesterday, {
        date: yesterday,
        totalTrades,
        leaderStats,
        topCoins,
      });
      
      // Broadcast to all chats
      this.broadcast(lines.join('\n'));
      
      logger.info({ date: yesterday, totalTrades }, 'Daily summary sent');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate daily summary');
    }
  }

  /**
   * Setup real-time position monitoring
   */
  private setupPositionMonitoring(): void {
    this.loop.setPositionChangeCallback(async (leader: string, changes: PositionChange[]) => {
      await this.notifyPositionChanges(leader, changes);
      
      // Track performance based on changes
      for (const change of changes) {
        if (change.type === 'opened' && change.position) {
          const side = change.position.size > 0 ? 'long' : 'short';
          this.stateStore.recordTradeOpen(
            leader,
            change.coin,
            side,
            Math.abs(change.position.size),
            change.position.entryPx
          );
        } else if (change.type === 'closed') {
          // Estimate PnL if we don't have it (would need more data for accurate calc)
          this.stateStore.recordTradeClose(
            leader,
            change.coin,
            Math.abs(change.previousSize || 0),
            undefined,
            0 // PnL not available on close without more context
          );
        }
      }
    });
  }

  /**
   * Notify about position changes (can be called externally)
   */
  public async notifyPositionChanges(leader: string, changes: PositionChange[]): Promise<void> {
    const nickname = this.stateStore.getLeaderNickname(leader);
    const displayName = nickname 
      ? `${nickname} (${leader.slice(0, 6)}...${leader.slice(-4)})`
      : `${leader.slice(0, 6)}...${leader.slice(-4)}`;
    
    const config = this.loop.getConfig();
    
    for (const change of changes) {
      let message = '';
      
      // Calculate notional for filtering
      const notional = change.position 
        ? Math.abs(change.position.size) * (change.position.entryPx || 0)
        : 0;
      
      // Skip notification if position is too small
      if (notional > 0 && notional < config.minNotionalForNotification) {
        logger.debug({ 
          leader, 
          coin: change.coin, 
          notional, 
          minRequired: config.minNotionalForNotification 
        }, 'Skipping notification - position too small');
        continue;
      }
      
      // Check if this triggers any alert
      const matchedAlert = this.stateStore.matchesAlert(change.coin, leader);
      const alertPrefix = matchedAlert ? '🚨🔔 **ALERT TRIGGERED** 🔔🚨\n\n' : '';
      
      if (change.type === 'opened') {
        const side = change.position!.size > 0 ? '🟢 LONG' : '🔴 SHORT';
        const entryPx = change.position!.entryPx || 0;
        const leverage = change.position!.leverage || 1;
        
        // Fetch current price
        let priceInfo = '';
        try {
          const marketData = await this.infoClient.getMarketData([change.coin]);
          const market = marketData.get(change.coin);
          const currentPrice = market?.markPrice || market?.lastPrice || 0;
          
          if (currentPrice > 0) {
            const priceDiff = currentPrice - entryPx;
            const priceDiffPercent = (priceDiff / entryPx) * 100;
            const priceEmoji = priceDiff >= 0 ? '📈' : '📉';
            priceInfo = `\n💲 Current: $${currentPrice.toFixed(4)} ${priceEmoji} ${priceDiffPercent >= 0 ? '+' : ''}${priceDiffPercent.toFixed(2)}%`;
          }
        } catch (error) {
          // Ignore error, just don't show current price
        }
        
        message = `
${alertPrefix}🚨 **Leader Trade Alert**

👤 Leader: ${displayName}
🎯 Action: **NEW POSITION**

${side} **${change.coin}**
📊 Size: ${Math.abs(change.position!.size).toFixed(4)}
💰 Notional: ~$${notional.toFixed(2)}
⚡ Leverage: ${leverage.toFixed(1)}x
💵 Entry: $${entryPx.toFixed(4)}${priceInfo}
        `.trim();
      } else if (change.type === 'modified') {
        const prevSize = Math.abs(change.previousSize || 0);
        const newSize = Math.abs(change.position!.size);
        const sizeDiff = newSize - prevSize;
        const changePercent = prevSize > 0 ? (Math.abs(sizeDiff) / prevSize) * 100 : 100;
        
        // Only notify if change is significant (>5%) or enough time has passed (2 min)
        const notificationKey = `${leader}-${change.coin}`;
        const lastNotif = this.lastNotificationTime.get(notificationKey) || 0;
        const timeSinceLastNotif = Date.now() - lastNotif;
        const shouldNotify = changePercent > 5 || timeSinceLastNotif > 120000; // 5% or 2 minutes
        
        if (!shouldNotify) {
          continue; // Skip this notification
        }
        
        this.lastNotificationTime.set(notificationKey, Date.now());
        
        const action = sizeDiff > 0 ? '📈 INCREASED' : '📉 REDUCED';
        const side = change.position!.size > 0 ? '🟢 LONG' : '🔴 SHORT';
        const entryPx = change.position!.entryPx || 0;
        const notional = newSize * entryPx;
        const leverage = change.position!.leverage || 1;
        const unrealizedPnl = change.position!.unrealizedPnl || 0;
        const pnlEmoji = unrealizedPnl >= 0 ? '💰' : '💸';
        
        // Calculate delta in USD
        const deltaUsd = Math.abs(sizeDiff) * entryPx;
        
        // Fetch current price
        let currentPrice = 0;
        let priceInfo = '';
        try {
          const marketData = await this.infoClient.getMarketData([change.coin]);
          const market = marketData.get(change.coin);
          currentPrice = market?.markPrice || market?.lastPrice || 0;
          
          if (currentPrice > 0) {
            const priceDiff = currentPrice - entryPx;
            const priceDiffPercent = (priceDiff / entryPx) * 100;
            const priceEmoji = priceDiff >= 0 ? '📈' : '📉';
            priceInfo = `\n💲 Current: $${currentPrice.toFixed(4)} ${priceEmoji} ${priceDiffPercent >= 0 ? '+' : ''}${priceDiffPercent.toFixed(2)}%`;
          }
        } catch (error) {
          // Ignore error, just don't show current price
        }
        
        message = `
${alertPrefix}${action === '📈 INCREASED' ? '📈' : '📉'} **${displayName}** | ${side} **${change.coin}**

📊 Size: ${newSize.toFixed(4)} (${sizeDiff > 0 ? '+' : ''}${sizeDiff.toFixed(4)})
💵 Entry: $${entryPx.toFixed(4)} | Lev: ${leverage.toFixed(1)}x${priceInfo}
💰 Notional: $${notional.toFixed(0)} | Delta: $${deltaUsd.toFixed(0)}
${pnlEmoji} PnL: $${unrealizedPnl.toFixed(2)}
        `.trim();
      } else if (change.type === 'closed') {
        message = `
✅ **Position Closed**

👤 Leader: ${displayName}
🎯 Action: **CLOSED**

**${change.coin}**
📊 Size: ${Math.abs(change.previousSize || 0).toFixed(4)}
        `.trim();
      }

      if (message) {
        this.broadcast(message);
      }
    }
  }

  /**
   * Register all bot commands
   */
  private registerCommands(): void {
    // Whitelist check middleware
    this.bot.on('message', msg => {
      if (msg.chat.id && !this.allowedChatIds.has(msg.chat.id)) {
        logger.warn({ chatId: msg.chat.id }, 'Unauthorized chat ID attempted to use bot');
        this.bot.sendMessage(msg.chat.id, '❌ Unauthorized. Your chat ID is not whitelisted.');
      }
    });

    // /on - Enable auto-copy
    this.bot.onText(/^\/on$/, msg => {
      if (!this.isAuthorized(msg.chat.id)) return;
      this.loop.enable();
      this.sendMessage(msg.chat.id, '✅ Auto-copy enabled');
    });

    // /off - Disable auto-copy
    this.bot.onText(/^\/off$/, msg => {
      if (!this.isAuthorized(msg.chat.id)) return;
      this.loop.disable();
      this.sendMessage(msg.chat.id, '🛑 Auto-copy disabled');
    });

    // /status - Show status
    this.bot.onText(/^\/status$/, async msg => {
      if (!this.isAuthorized(msg.chat.id)) return;
      await this.handleStatus(msg.chat.id);
    });

    // /ratio <value> - Set ratio
    this.bot.onText(/^\/ratio\s+(\d+\.?\d*)$/, (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const ratio = parseFloat(match![1]);
      if (ratio < 0 || ratio > 1) {
        this.sendMessage(msg.chat.id, '❌ Ratio must be between 0 and 1');
        return;
      }
      this.loop.updateParams({ ratio });
      this.sendMessage(msg.chat.id, `✅ Ratio set to ${ratio}`);
    });

    // /cap <value> - Set notional cap
    this.bot.onText(/^\/cap\s+(\d+\.?\d*)$/, (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const cap = parseFloat(match![1]);
      this.loop.updateParams({ notionalCap: cap });
      this.sendMessage(msg.chat.id, `✅ Notional cap set to ${cap} USD`);
    });

    // /maxlev <value> - Set max leverage
    this.bot.onText(/^\/maxlev\s+(\d+\.?\d*)$/, (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const maxLev = parseFloat(match![1]);
      this.riskEngine.updateParams({ maxLeverage: maxLev });
      this.sendMessage(msg.chat.id, `✅ Max leverage set to ${maxLev}x`);
    });

    // /maxnotional <value> - Set max total notional
    this.bot.onText(/^\/maxnotional\s+(\d+\.?\d*)$/, (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const maxNotional = parseFloat(match![1]);
      this.riskEngine.updateParams({ maxTotalNotional: maxNotional });
      this.sendMessage(msg.chat.id, `✅ Max total notional set to ${maxNotional} USD`);
    });

    // /tif <IOC|GTC> - Set Time In Force
    this.bot.onText(/^\/tif\s+(IOC|GTC)$/i, (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const tif = match![1].toUpperCase() as 'IOC' | 'GTC';
      this.loop.updateParams({ tif });
      this.sendMessage(msg.chat.id, `✅ TIF set to ${tif}`);
    });

    // /mode - Change copy trading mode
    this.bot.onText(/^\/mode\s+(full|entry-only|signals-only)$/i, (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const mode = match![1].toLowerCase() as 'full' | 'entry-only' | 'signals-only';
      this.loop.updateParams({ copyMode: mode });
      this.stateStore.set('copyMode', mode);
      
      const modeDescriptions = {
        'full': '📋 **Full Copy** - Copies all position changes (opens, closes, size increases/decreases)',
        'entry-only': '🎯 **Entry Only** - Only copies position opens and closes (ignores size adjustments)',
        'signals-only': '📢 **Signals Only** - No trades, only notifications of leader activity'
      };
      
      this.sendMessage(msg.chat.id, `✅ Copy mode set to:\n\n${modeDescriptions[mode]}`);
    });

    // /panic - Enable panic mode
    this.bot.onText(/^\/panic$/, async msg => {
      if (!this.isAuthorized(msg.chat.id)) return;
      await this.handlePanic(msg.chat.id);
    });

    // /resume - Disable panic mode
    this.bot.onText(/^\/resume$/, msg => {
      if (!this.isAuthorized(msg.chat.id)) return;
      this.riskEngine.disablePanicMode();
      this.sendMessage(msg.chat.id, '✅ Panic mode disabled. Use /on to re-enable auto-copy.');
    });

    // /leaders add <address> [nickname] - Add leader with optional nickname
    this.bot.onText(/^\/leaders\s+add\s+(0x[a-fA-F0-9]{40})(?:\s+(.+))?$/, (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const address = match![1].toLowerCase();
      const nickname = match![2]?.trim();
      
      const config = this.loop.getConfig();
      if (config.leaderAddresses.includes(address)) {
        this.sendMessage(msg.chat.id, '⚠️ Leader already exists');
        return;
      }
      const newLeaders = [...config.leaderAddresses, address];
      this.loop.updateParams({ leaderAddresses: newLeaders });
      this.stateStore.set('leaders', newLeaders);
      
      // Set nickname if provided
      if (nickname) {
        this.stateStore.setLeaderNickname(address, nickname);
        this.sendMessage(msg.chat.id, `✅ Leader added: **${nickname}** (\`${address.slice(0, 10)}...\`)`);
      } else {
        this.sendMessage(msg.chat.id, `✅ Leader added: ${address}\n💡 Set a nickname with: /nick ${address} YourName`);
      }
    });

    // /leaders rm <address> - Remove leader
    this.bot.onText(/^\/leaders\s+rm\s+(0x[a-fA-F0-9]{40})$/, (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const address = match![1].toLowerCase();
      const config = this.loop.getConfig();
      const newLeaders = config.leaderAddresses.filter(a => a !== address);
      if (newLeaders.length === config.leaderAddresses.length) {
        this.sendMessage(msg.chat.id, '⚠️ Leader not found');
        return;
      }
      if (newLeaders.length === 0) {
        this.sendMessage(msg.chat.id, '❌ Cannot remove last leader');
        return;
      }
      this.loop.updateParams({ leaderAddresses: newLeaders });
      this.stateStore.set('leaders', newLeaders);
      this.stateStore.removeLeaderNickname(address);
      this.sendMessage(msg.chat.id, `✅ Leader removed: ${address}`);
    });

    // /nick <address> <nickname> - Set nickname for leader
    this.bot.onText(/^\/nick\s+(0x[a-fA-F0-9]{40})\s+(.+)$/, (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const address = match![1].toLowerCase();
      const nickname = match![2].trim();
      
      const config = this.loop.getConfig();
      if (!config.leaderAddresses.includes(address)) {
        this.sendMessage(msg.chat.id, '⚠️ This address is not in your leaders list');
        return;
      }

      this.stateStore.setLeaderNickname(address, nickname);
      this.sendMessage(msg.chat.id, `✅ Nickname set: ${nickname} → ${address.slice(0, 10)}...`);
    });

    // /leaders - List all leaders
    this.bot.onText(/^\/leaders$/, (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const config = this.loop.getConfig();
      
      if (config.leaderAddresses.length === 0) {
        this.sendMessage(msg.chat.id, '📋 No leaders configured\n\nUse /leaders add <0x...> to add one');
        return;
      }

      const lines = ['📋 **Your Leaders:**', ''];
      config.leaderAddresses.forEach((addr, i) => {
        const nickname = this.stateStore.getLeaderNickname(addr);
        const display = nickname 
          ? `${i + 1}. **${nickname}** (\`${addr.slice(0, 10)}...${addr.slice(-4)}\`)`
          : `${i + 1}. \`${addr}\``;
        lines.push(display);
      });

      lines.push('', '💡 Set nicknames with: /nick <address> <name>');
      
      this.sendMessage(msg.chat.id, lines.join('\n'));
    });

    // /positions <address|nickname> - Show current positions of a leader
    this.bot.onText(/^\/positions(?:\s+(.+))?$/, async (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      
      let address: string | undefined;
      
      if (match && match[1]) {
        const input = match[1].trim();
        
        // Check if it's an address
        if (input.startsWith('0x') && input.length === 42) {
          address = input.toLowerCase();
        } else {
          // Try to find by nickname
          const config = this.loop.getConfig();
          for (const addr of config.leaderAddresses) {
            const nickname = this.stateStore.getLeaderNickname(addr);
            if (nickname && nickname.toLowerCase() === input.toLowerCase()) {
              address = addr;
              break;
            }
          }
          
          if (!address) {
            this.sendMessage(msg.chat.id, `⚠️ Leader not found: "${input}"\n\nUse an address (0x...) or a known nickname`);
            return;
          }
        }
      } else {
        // No argument - show list of leaders to choose from
        const config = this.loop.getConfig();
        if (config.leaderAddresses.length === 0) {
          this.sendMessage(msg.chat.id, '⚠️ No leaders configured\n\nAdd one with: /leaders add <0x...>');
          return;
        }
        
        const lines = ['📊 **Choose a leader to view positions:**', ''];
        config.leaderAddresses.forEach((addr, i) => {
          const nickname = this.stateStore.getLeaderNickname(addr);
          const display = nickname 
            ? `/positions ${nickname}`
            : `/positions ${addr}`;
          lines.push(`${i + 1}. ${display}`);
        });
        
        this.sendMessage(msg.chat.id, lines.join('\n'));
        return;
      }
      
      // Fetch positions for the leader
      try {
        this.sendMessage(msg.chat.id, '🔄 Fetching positions...');
        const positions = await this.infoClient.getPositions(address);
        
        const nickname = this.stateStore.getLeaderNickname(address);
        const displayName = nickname || `${address.slice(0, 10)}...`;
        
        if (positions.length === 0) {
          this.sendMessage(msg.chat.id, `📊 **${displayName}**\n\nNo open positions`);
          return;
        }
        
        // Fetch current market prices for all coins
        const coins = positions.map(p => p.coin);
        const marketData = await this.infoClient.getMarketData(coins);
        
        // Calculate total notional
        let totalNotional = 0;
        const lines = [`📊 **${displayName}** - Open Positions`, ''];
        
        positions.forEach((pos, i) => {
          const side = pos.size > 0 ? '🟢 LONG' : '🔴 SHORT';
          const size = Math.abs(pos.size);
          const entryPx = pos.entryPx || 0;
          const notional = size * entryPx;
          totalNotional += notional;
          
          const unrealizedPnl = pos.unrealizedPnl || 0;
          const pnlEmoji = unrealizedPnl >= 0 ? '💰' : '💸';
          const leverage = pos.leverage ? `${pos.leverage.toFixed(1)}x` : 'N/A';
          
          // Get current price
          const market = marketData.get(pos.coin);
          const currentPrice = market?.markPrice || market?.lastPrice || 0;
          let priceInfo = '';
          if (currentPrice > 0) {
            const priceDiff = currentPrice - entryPx;
            const priceDiffPercent = (priceDiff / entryPx) * 100;
            const priceEmoji = priceDiff >= 0 ? '📈' : '📉';
            priceInfo = ` → $${currentPrice.toFixed(4)} ${priceEmoji} ${priceDiffPercent >= 0 ? '+' : ''}${priceDiffPercent.toFixed(2)}%`;
          }
          
          lines.push(`**${i + 1}. ${pos.coin}** ${side}`);
          lines.push(`   Size: ${size.toFixed(4)} | Entry: $${entryPx.toFixed(4)}${priceInfo}`);
          lines.push(`   Notional: $${notional.toFixed(2)} | Lev: ${leverage}`);
          lines.push(`   ${pnlEmoji} PnL: $${unrealizedPnl.toFixed(2)}`);
          lines.push('');
        });
        
        lines.push(`💼 **Total Notional:** $${totalNotional.toFixed(2)}`);
        lines.push(`📈 **Position Count:** ${positions.length}`);
        
        this.sendMessage(msg.chat.id, lines.join('\n'));
      } catch (error: any) {
        logger.error({ error: error.message, address }, 'Failed to fetch leader positions');
        this.sendMessage(msg.chat.id, `❌ Failed to fetch positions for ${address.slice(0, 10)}...`);
      }
    });

    // /snapshot - Get current snapshot of all leader positions
    this.bot.onText(/^\/snapshot$/, async (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      
      const config = this.loop.getConfig();
      if (config.leaderAddresses.length === 0) {
        this.sendMessage(msg.chat.id, '⚠️ No leaders configured');
        return;
      }

      try {
        this.sendMessage(msg.chat.id, '📸 Taking snapshot of all leader positions...');
        
        const lines = ['📸 **Current Positions Snapshot**', ''];
        let totalLeaders = 0;
        let totalPositions = 0;
        let totalNotional = 0;
        
        for (const leader of config.leaderAddresses) {
          const positions = await this.infoClient.getPositions(leader);
          
          if (positions.length === 0) continue;
          
          totalLeaders++;
          totalPositions += positions.length;
          
          const nickname = this.stateStore.getLeaderNickname(leader);
          const displayName = nickname || `${leader.slice(0, 10)}...`;
          
          lines.push(`\n👤 **${displayName}**`);
          
          for (const pos of positions) {
            const side = pos.size > 0 ? '🟢 L' : '🔴 S';
            const size = Math.abs(pos.size);
            const entryPx = pos.entryPx || 0;
            const notional = size * entryPx;
            totalNotional += notional;
            const leverage = pos.leverage ? `${pos.leverage.toFixed(1)}x` : '';
            
            lines.push(`   ${side} **${pos.coin}** | $${notional.toFixed(0)} ${leverage ? `(${leverage})` : ''}`);
          }
        }
        
        if (totalPositions === 0) {
          this.sendMessage(msg.chat.id, '📸 No open positions across all leaders');
          return;
        }
        
        lines.push('');
        lines.push(`📊 **Summary:**`);
        lines.push(`   Leaders: ${totalLeaders} | Positions: ${totalPositions}`);
        lines.push(`   Total Notional: $${totalNotional.toFixed(2)}`);
        lines.push('');
        lines.push('💡 Use /positions <leader> for detailed view');
        
        this.sendMessage(msg.chat.id, lines.join('\n'));
      } catch (error: any) {
        logger.error({ error: error.message }, 'Failed to fetch snapshot');
        this.sendMessage(msg.chat.id, '❌ Failed to fetch snapshot');
      }
    });

    // /alerts - Manage alerts
    this.bot.onText(/^\/alerts$/, (msg) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const alerts = this.stateStore.getAlerts();
      
      if (alerts.length === 0) {
        this.sendMessage(msg.chat.id, '🔔 **No alerts configured**\n\nAdd alerts with:\n• /alerts add <COIN> - Alert on any leader trading this coin\n• /alerts add <COIN> <address|nickname> - Alert on specific leader + coin');
        return;
      }

      const lines = ['🔔 **Your Alerts:**', ''];
      alerts.forEach((alert, i) => {
        if (alert.type === 'coin') {
          lines.push(`${i + 1}. 🪙 **${alert.coin}** (any leader)`);
        } else {
          const nickname = this.stateStore.getLeaderNickname(alert.leader!);
          const leaderDisplay = nickname || `${alert.leader!.slice(0, 10)}...`;
          lines.push(`${i + 1}. 🎯 **${alert.coin}** + **${leaderDisplay}**`);
        }
        lines.push(`   ID: \`${alert.id}\``);
        lines.push('');
      });

      lines.push('💡 Remove with: /alerts rm <id>');
      this.sendMessage(msg.chat.id, lines.join('\n'));
    });

    // /alerts add <coin> [leader] - Add alert
    this.bot.onText(/^\/alerts\s+add\s+([A-Z0-9]+)(?:\s+(.+))?$/i, (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const coin = match![1].toUpperCase();
      const leaderInput = match![2]?.trim();

      if (!leaderInput) {
        // Coin-only alert
        const alert = this.stateStore.addAlert({ type: 'coin', coin });
        this.sendMessage(msg.chat.id, `✅ Alert added!\n\n🔔 You'll be notified when **any leader** opens a position on **${coin}**\n\nID: \`${alert.id}\``);
      } else {
        // Leader + coin alert
        let address: string | undefined;
        
        // Check if it's an address
        if (leaderInput.startsWith('0x') && leaderInput.length === 42) {
          address = leaderInput.toLowerCase();
        } else {
          // Try to find by nickname
          const config = this.loop.getConfig();
          for (const addr of config.leaderAddresses) {
            const nickname = this.stateStore.getLeaderNickname(addr);
            if (nickname && nickname.toLowerCase() === leaderInput.toLowerCase()) {
              address = addr;
              break;
            }
          }
        }

        if (!address) {
          this.sendMessage(msg.chat.id, `⚠️ Leader not found: "${leaderInput}"\n\nUse an address or a known nickname`);
          return;
        }

        const nickname = this.stateStore.getLeaderNickname(address);
        const displayName = nickname || `${address.slice(0, 10)}...`;
        
        const alert = this.stateStore.addAlert({ type: 'leader-coin', coin, leader: address });
        this.sendMessage(msg.chat.id, `✅ Alert added!\n\n🔔 You'll be notified when **${displayName}** opens a position on **${coin}**\n\nID: \`${alert.id}\``);
      }
    });

    // /alerts rm <id> - Remove alert
    this.bot.onText(/^\/alerts\s+rm\s+(.+)$/, (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const id = match![1].trim();
      
      const removed = this.stateStore.removeAlert(id);
      if (removed) {
        this.sendMessage(msg.chat.id, `✅ Alert removed: \`${id}\``);
      } else {
        this.sendMessage(msg.chat.id, `⚠️ Alert not found: \`${id}\``);
      }
    });

    // /findleaders - Auto-find best traders
    this.bot.onText(/^\/findleaders(?:\s+(\d+))?(?:\s+(.+))?$/, async (msg, match) => {
      console.log('🔍 /findleaders command triggered!');
      if (!this.isAuthorized(msg.chat.id)) {
        console.log('❌ User not authorized');
        return;
      }
      const topN = match && match[1] ? parseInt(match[1]) : 3;
      const customAddresses = match && match[2]
        ? match[2].split(/[,\s]+/).filter((a: string) => a.startsWith('0x'))
        : undefined;
      console.log(`📊 Looking for top ${topN} traders`);
      await this.handleFindLeaders(msg.chat.id, topN, customAddresses);
    });

    // /analyzeleader <address> - Analyze a specific trader
    this.bot.onText(/^\/analyzeleader\s+(0x[a-fA-F0-9]{40})$/, async (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const address = match![1];
      await this.handleAnalyzeLeader(msg.chat.id, address);
    });

    // /leaderperf [address] - Show leader performance
    this.bot.onText(/^\/leaderperf(?:\s+(0x[a-fA-F0-9]{40}))?$/, async (msg, match) => {
      if (!this.isAuthorized(msg.chat.id)) return;
      const address = match && match[1] ? match![1] : undefined;
      await this.handleLeaderPerformance(msg.chat.id, address);
    });

    // /help - Show help
    this.bot.onText(/^\/help$/, msg => {
      if (!this.isAuthorized(msg.chat.id)) return;
      this.handleHelp(msg.chat.id);
    });

    logger.info('Telegram commands registered');
    
    // Register commands with Telegram for autocomplete
    this.registerBotCommands();
  }

  /**
   * Register bot commands with Telegram for autocomplete
   */
  private async registerBotCommands(): Promise<void> {
    try {
      await this.bot.setMyCommands([
        { command: 'on', description: 'Enable auto-copy' },
        { command: 'off', description: 'Disable auto-copy' },
        { command: 'status', description: 'Show current status and positions' },
        { command: 'ratio', description: 'Set copy ratio (e.g., /ratio 0.2)' },
        { command: 'cap', description: 'Set max notional per order' },
        { command: 'maxlev', description: 'Set max leverage' },
        { command: 'maxnotional', description: 'Set max total notional' },
        { command: 'tif', description: 'Set Time In Force (IOC/GTC)' },
        { command: 'mode', description: 'Set copy mode (full/entry-only/signals-only)' },
        { command: 'leaders', description: 'List/manage leaders' },
        { command: 'nick', description: 'Set nickname for a leader' },
        { command: 'snapshot', description: 'Snapshot of all leader positions' },
        { command: 'positions', description: 'Show positions of a leader' },
        { command: 'leaderperf', description: 'Show leader performance stats' },
        { command: 'findleaders', description: 'Find top traders automatically' },
        { command: 'analyzeleader', description: 'Analyze a specific trader' },
        { command: 'alerts', description: 'Manage coin/leader alerts' },
        { command: 'panic', description: 'Enable PANIC mode (emergency stop)' },
        { command: 'resume', description: 'Disable PANIC mode' },
        { command: 'help', description: 'Show all commands' },
      ]);
      logger.info('Bot commands registered with Telegram');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to register bot commands');
    }
  }

  /**
   * Check if chat is authorized
   */
  private isAuthorized(chatId: number): boolean {
    return this.allowedChatIds.has(chatId);
  }

  /**
   * Handle /status command
   */
  private async handleStatus(chatId: number): Promise<void> {
    try {
      const loopConfig = this.loop.getConfig();
      const riskState = this.riskEngine.getState();
      const counters = this.executor.getCounters();

      // Fetch follower positions
      let positionsSummary = 'N/A';
      try {
        const positions = await this.infoClient.getPositions(this.followerAddress);
        if (positions.length === 0) {
          positionsSummary = 'No open positions';
        } else {
          positionsSummary = positions
            .map(p => `${p.coin}: ${p.size.toFixed(4)}`)
            .join('\n');
        }
      } catch (error) {
        positionsSummary = 'Failed to fetch positions';
      }

      const message = `
📊 **Status Report**

**Config:**
- Auto-copy: ${loopConfig.enabled ? '✅ ON' : '🛑 OFF'}
- Mode: ${riskState.panicMode ? '🚨 PANIC' : '🟢 Normal'}
- Copy Mode: ${this.stateStore.get('copyMode')}
- Circuit Breaker: ${riskState.autoTradingDisabled ? '⚠️ TRIPPED' : '✅ OK'}
- Ratio: ${loopConfig.ratio}
- Notional Cap: $${loopConfig.notionalCap}
- Max Leverage: ${riskState.maxLeverage}x
- Max Total Notional: $${riskState.maxTotalNotional}
- TIF: ${loopConfig.tif}
- Poll Interval: ${loopConfig.pollIntervalMs}ms

**Leaders:**
${loopConfig.leaderAddresses.map((a, i) => `${i + 1}. ${a}`).join('\n')}

**Follower Positions:**
${positionsSummary}

**Counters:**
- Executed: ${counters.execCount}
- Rejected: ${counters.rejectCount}
- Errors: ${counters.errorCount}
- Circuit Breaker Errors: ${riskState.circuitBreakerErrors}/5
      `.trim();

      this.sendMessage(chatId, message);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate status');
      this.sendMessage(chatId, '❌ Failed to generate status');
    }
  }

  /**
   * Handle /panic command
   */
  private async handlePanic(chatId: number): Promise<void> {
    try {
      // Enable panic mode
      this.riskEngine.enablePanicMode();
      this.loop.disable();

      this.sendMessage(chatId, '🚨 PANIC MODE ACTIVATED\nDisabling auto-copy and closing all positions...');

      // Fetch current positions
      const positions = await this.infoClient.getPositions(this.followerAddress);

      if (positions.length === 0) {
        this.sendMessage(chatId, '✅ No positions to close');
        return;
      }

      // Cancel all open orders first
      await this.exchangeClient.cancelAllOpenOrders();

      // Close all positions with reduce-only orders
      // TODO: Implement actual position closing
      logger.warn('PANIC: TODO - implement actual position closing');

      this.sendMessage(
        chatId,
        `⚠️ PANIC: ${positions.length} positions detected.\nTODO: Implement actual close orders.\nManually close if needed.`,
      );
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to execute panic');
      this.sendMessage(chatId, '❌ Failed to execute panic mode');
    }
  }

  /**
   * Handle /findleaders command
   */
  private async handleFindLeaders(chatId: number, topN: number, customAddresses?: string[]): Promise<void> {
    console.log(`🚀 handleFindLeaders called: topN=${topN}, customAddresses=${customAddresses?.length || 0}`);
    try {
      const addressInfo = customAddresses && customAddresses.length > 0
        ? ` (analyzing ${customAddresses.length} custom addresses)`
        : '';
      
      this.sendMessage(chatId, `🔍 Searching for the top ${topN} traders${addressInfo}...\nThis may take a minute...`);

      console.log('📡 Calling traderAnalyzer.getRecommendedTraders...');
      const bestTraders = await this.traderAnalyzer.getRecommendedTraders(topN, customAddresses);
      console.log(`✅ Got ${bestTraders.length} traders from analyzer`);

      if (bestTraders.length === 0) {
        this.sendMessage(
          chatId, 
          '❌ No suitable traders found.\n\n' +
          '💡 Try:\n' +
          '/findleaders 5 0xADDRESS1 0xADDRESS2\n' +
          'to analyze specific addresses'
        );
        return;
      }

      // Add them to the leader list
      const config = this.loop.getConfig();
      const newLeaders = [...new Set([...config.leaderAddresses, ...bestTraders])];
      this.loop.updateParams({ leaderAddresses: newLeaders });

      const message = `
✅ **Found ${bestTraders.length} top traders!**

${bestTraders.map((addr, i) => `${i + 1}. \`${addr}\``).join('\n')}

They have been added to your leaders list.
Use /status to see all leaders.
      `.trim();

      this.sendMessage(chatId, message);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to find leaders');
      this.sendMessage(chatId, '❌ Failed to find leaders. Check logs for details.');
    }
  }

  /**
   * Handle /analyzeleader command
   */
  private async handleAnalyzeLeader(chatId: number, address: string): Promise<void> {
    try {
      this.sendMessage(chatId, `🔍 Analyzing trader ${address}...`);

      const metrics = await this.traderAnalyzer.analyzeTrader(address);

      if (!metrics) {
        this.sendMessage(chatId, '❌ Failed to analyze this trader.');
        return;
      }

      // Determine if trader is worth following
      const isGoodTrader = metrics.overallScore >= 50 && 
                           metrics.equity >= 1000 && 
                           metrics.positionCount > 0 &&
                           metrics.activityScore >= 20;

      const recommendation = isGoodTrader 
        ? '✅ Good trader to follow'
        : metrics.equity < 1000
          ? '⚠️ Low equity - not recommended'
          : metrics.activityScore < 20
            ? '⚠️ Low activity - not recommended'
            : metrics.overallScore < 50
              ? '⚠️ Low score - not recommended'
              : '❌ Not recommended';

      const message = `
📊 **Trader Analysis**

**Address:** \`${metrics.address}\`

**Portfolio:**
• Equity: $${metrics.equity.toFixed(2)}
• Total Notional: $${metrics.totalNotional.toFixed(2)}
• Active Positions: ${metrics.positionCount}
• Unrealized PnL: $${metrics.totalPnl.toFixed(2)}

**Scores:**
• Risk Management: ${metrics.riskScore.toFixed(1)}/100
• Activity Level: ${metrics.activityScore.toFixed(1)}/100
• Overall Score: ${metrics.overallScore.toFixed(1)}/100

${recommendation}
      `.trim();

      this.sendMessage(chatId, message);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to analyze leader');
      this.sendMessage(chatId, '❌ Failed to analyze trader. Check logs for details.');
    }
  }

  /**
   * Handle /leaderperf command
   */
  private async handleLeaderPerformance(chatId: number, address?: string): Promise<void> {
    try {
      const config = this.loop.getConfig();

      // If specific address provided
      if (address) {
        const addr = address.toLowerCase();
        if (!config.leaderAddresses.includes(addr)) {
          this.sendMessage(chatId, '⚠️ This address is not in your leaders list');
          return;
        }

        const summary = this.performanceTracker.getPerformanceSummary(addr);
        this.sendMessage(chatId, `📊 **Leader Performance**\n\n${summary}`);
        return;
      }

      // Show all leaders performance
      if (config.leaderAddresses.length === 0) {
        this.sendMessage(chatId, '⚠️ No leaders configured');
        return;
      }

      this.sendMessage(chatId, '📊 Generating performance report...');

      const rankings = this.performanceTracker.getRankings();
      
      if (rankings.length === 0) {
        this.sendMessage(chatId, '⚠️ No performance data yet. Leaders need to close some positions first.');
        return;
      }

      // Build message with rankings
      const lines = ['📊 **Leader Performance Rankings**', ''];
      
      rankings.forEach((rank, i) => {
        const nickname = this.stateStore.getLeaderNickname(rank.leader);
        const displayName = nickname || `${rank.leader.slice(0, 6)}...${rank.leader.slice(-4)}`;
        const pnlEmoji = rank.pnl >= 0 ? '💚' : '❤️';
        const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        
        lines.push(`${rankEmoji} **${displayName}**`);
        lines.push(`   ${pnlEmoji} P&L: ${rank.pnl >= 0 ? '+' : ''}$${rank.pnl.toFixed(2)}`);
        lines.push(`   📊 Win Rate: ${rank.winRate.toFixed(1)}% (${rank.trades} trades)`);
        lines.push('');
      });

      // Add recommendations
      const recommendations = this.performanceTracker.getRecommendations();
      if (recommendations.length > 0) {
        lines.push('💡 **Recommendations:**');
        recommendations.forEach(rec => lines.push(`   ${rec}`));
        lines.push('');
      }

      lines.push('💡 Use /leaderperf <address> for detailed stats');

      this.sendMessage(chatId, lines.join('\n'));
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get leader performance');
      this.sendMessage(chatId, '❌ Failed to get performance data');
    }
  }

  /**
   * Handle /help command
   */
  private handleHelp(chatId: number): void {
    const message = `
🤖 **Hyperliquid Copy Trading Bot - Commands**

**Control:**
/on - Enable auto-copy
/off - Disable auto-copy
/status - Show current status and positions

**Parameters:**
/ratio <0.0-1.0> - Set copy ratio (e.g., /ratio 0.2)
/cap <amount> - Set max notional per order in USD
/maxlev <value> - Set max leverage
/maxnotional <amount> - Set max total notional in USD
/tif <IOC|GTC> - Set Time In Force
/mode <full|entry-only|signals-only> - Set copy mode
  • full: Copy all position changes
  • entry-only: Only copy opens & closes
  • signals-only: Notifications only, no trades

**Leaders:**
/leaders - List current leaders
/leaders add <0x...> [name] - Add a leader (with optional nickname)
  Example: /leaders add 0xABC... BigWhale
/leaders rm <0x...> - Remove a leader wallet
/nick <0x...> <name> - Set/change nickname for a leader
/snapshot - Get current snapshot of all leader positions
/positions [address|nickname] - Show current positions of a leader
/leaderperf [address] - Show performance stats & rankings
/findleaders [N] [addresses...] - Find top N traders
  Example: /findleaders 5
  Example: /findleaders 3 0xABC... 0xDEF...
/analyzeleader <0x...> - Analyze a specific trader

**Alerts:**
/alerts - List all active alerts
/alerts add <COIN> - Get notified when ANY leader trades this coin
  Example: /alerts add BTC
/alerts add <COIN> <leader> - Alert for specific leader + coin
  Example: /alerts add BTC loracle
/alerts rm <id> - Remove an alert

**Emergency:**
/panic - Enable PANIC mode (stop trading, close all positions)
/resume - Disable PANIC mode (must also /on to resume trading)

**Info:**
/help - Show this message

**Note:** You'll receive a daily summary of all leader activity automatically!
    `.trim();

    this.sendMessage(chatId, message);
  }

  /**
   * Send a message to a chat
   */
  sendMessage(chatId: number, text: string): void {
    this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }).catch(error => {
      logger.error({ error: error.message, chatId }, 'Failed to send Telegram message');
    });
  }

  /**
   * Broadcast a notification to all allowed chats
   */
  broadcast(text: string): void {
    for (const chatId of this.allowedChatIds) {
      this.sendMessage(chatId, text);
    }
  }

  /**
   * Stop the bot
   */
  stop(): void {
    this.bot.stopPolling();
    logger.info('Telegram bot stopped');
  }
}
