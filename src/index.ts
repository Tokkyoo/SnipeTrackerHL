import { loadConfig } from './config';
import { logger } from './utils/logger';
import { InfoClient } from './hyperliquid/infoClient';
import { ExchangeClient } from './hyperliquid/exchangeClient';
import { Aggregator } from './core/aggregator';
import { Targeting } from './core/targeting';
import { RiskEngine } from './core/riskEngine';
import { Executor } from './core/executor';
import { CopyTradingLoop } from './core/loop';
import { TelegramBotController } from './telegram/bot';
import { StateStore } from './store/stateStore';
import { DashboardServer } from './server/dashboardServer';

/**
 * Main entry point
 */
async function main() {
  logger.info('🚀 Hyperliquid Copy Trading Bot starting...');

  try {
    // Load configuration
    const config = loadConfig();
    logger.info(
      {
        mode: config.mode,
        leaders: config.leaderAddresses.length,
        ratio: config.ratioDefault,
        dryRun: config.dryRunLogOnly,
      },
      'Configuration loaded',
    );

    // Initialize state store
    const stateStore = new StateStore(
      {
        ratio: config.ratioDefault,
        notionalCap: config.notionalCapPerOrderUsd,
        maxLeverage: config.maxLeverage,
        maxTotalNotional: config.maxTotalNotionalUsd,
        tif: config.tifDefault,
        cooldownMs: config.cooldownMsPerCoin,
        copyMode: config.copyModeDefault,
        // Don't pass leaders here - let StateStore use persisted leaders from state.json
        // leaders: config.leaderAddresses, 
      },
      config.stateFile,
    );

    // Derive follower address from private key
    // TODO: Implement proper address derivation from private key
    const followerAddress = '0x0000000000000000000000000000000000000000'; // Placeholder
    logger.warn('TODO: Derive follower address from private key');

    // Initialize components
    const infoClient = new InfoClient();
    const exchangeClient = new ExchangeClient(config.followerPrivateKey, config.mode);
    const aggregator = new Aggregator();
    const targeting = new Targeting();
    const riskEngine = new RiskEngine(
      stateStore.get('maxLeverage'),
      stateStore.get('maxTotalNotional'),
      stateStore.get('cooldownMs'),
    );
    const executor = new Executor(exchangeClient, riskEngine, config.dryRunLogOnly);

    // Initialize copy trading loop
    const loop = new CopyTradingLoop(infoClient, aggregator, targeting, executor, {
      pollIntervalMs: config.pollIntervalMs,
      leaderAddresses: stateStore.get('leaders'),
      followerAddress,
      ratio: stateStore.get('ratio'),
      notionalCap: stateStore.get('notionalCap'),
      tif: stateStore.get('tif'),
      dryRun: config.dryRunLogOnly,
      copyMode: stateStore.get('copyMode'),
      minNotionalForNotification: config.minNotionalForNotification,
    });

    // Restore enabled state from store
    if (stateStore.get('enabled')) {
      loop.enable();
    }

    // Restore panic state
    if (stateStore.get('panic')) {
      riskEngine.enablePanicMode();
    }

    // Initialize Telegram bot
    const telegramBot = new TelegramBotController(
      config.telegramBotToken,
      config.telegramAllowedChatIds,
      loop,
      riskEngine,
      executor,
      exchangeClient,
      infoClient,
      followerAddress,
      stateStore,
    );

    // Initialize Dashboard
    const dashboardServer = new DashboardServer(3001);
    await dashboardServer.start();

    // Setup callback to reload leaders when changed from dashboard
    dashboardServer.onLeadersChange(async () => {
      const currentLeaders = loop.getLeaderAddresses();
      const newLeaders = stateStore.get('leaders');
      
      // Find newly added leaders
      const addedLeaders = newLeaders.filter((addr: string) => !currentLeaders.includes(addr));
      
      // Update the loop with new leaders
      loop.updateParams({ leaderAddresses: newLeaders });
      logger.info({ leaders: newLeaders, added: addedLeaders }, 'Leaders reloaded from state.json');
      
      // Fetch and display positions of newly added leaders
      for (const leaderAddr of addedLeaders) {
        try {
          const positions = await infoClient.getPositions(leaderAddr);
          logger.info({ leader: leaderAddr, positionCount: positions.length }, 'Fetching positions for new leader');
          
          // Send each position as a feed event
          for (const pos of positions) {
            if (pos.size !== 0) {
              dashboardServer.addTrade({
                type: 'position_opened',
                coin: pos.coin,
                side: pos.size > 0 ? 'buy' : 'sell',
                size: Math.abs(pos.size),
                price: pos.entryPx || 0,
                leader: leaderAddr
              });
            }
          }
        } catch (error: any) {
          logger.error({ leader: leaderAddr, error: error.message }, 'Failed to fetch positions for new leader');
        }
      }
    });

    // Connect loop to dashboard
    loop.setPositionsUpdateCallback((positions) => {
      dashboardServer.updatePositions(positions);
    });

    loop.setPositionChangeCallback((leader, changes) => {
      // Notify Telegram of position changes
      telegramBot.notifyPositionChanges(leader, changes);
      
      // Send trades to dashboard
      for (const change of changes) {
        if (change.type === 'opened' && change.position) {
          dashboardServer.addTrade({
            type: 'position_opened',
            coin: change.coin,
            side: change.position.size > 0 ? 'buy' : 'sell',
            size: change.position.size,
            price: change.position.entryPx,
            leader: leader
          });
        } else if (change.type === 'modified' && change.position) {
          const prevSize = Math.abs(change.previousSize || 0);
          const newSize = Math.abs(change.position.size);
          const sizeDiff = newSize - prevSize;
          const isLong = change.position.size > 0;
          
          // For LONG: size increase = buy, size decrease = sell
          // For SHORT: size increase = sell (shorting more), size decrease = buy (covering)
          const side = isLong 
            ? (sizeDiff > 0 ? 'buy' : 'sell')
            : (sizeDiff > 0 ? 'sell' : 'buy');
          
          dashboardServer.addTrade({
            type: 'position_modified',
            coin: change.coin,
            side: side,
            size: Math.abs(sizeDiff),
            price: change.position.entryPx,
            leader: leader,
            previousSize: prevSize,
            newSize: newSize
          });
        } else if (change.type === 'closed') {
          dashboardServer.addTrade({
            type: 'position_closed',
            coin: change.coin,
            side: (change.previousSize || 0) > 0 ? 'sell' : 'buy',
            size: change.previousSize || 0,
            price: 0,
            leader: leader
          });
        }
      }
    });

    // Update dashboard with leaders
    const leaders = stateStore.get('leaders').map((addr: string) => ({ address: addr }));
    dashboardServer.updateLeaders(leaders);

    // Broadcast startup message
    telegramBot.broadcast(`
🚀 **Bot Started**

Mode: ${config.mode.toUpperCase()}
Leaders: ${config.leaderAddresses.length}
Auto-copy: ${stateStore.get('enabled') ? 'ON' : 'OFF'}

Use /help for commands.
    `);

    // Start the copy trading loop
    logger.info('Starting copy trading loop...');
    loop.start().catch(error => {
      logger.error({ error: error.message }, 'Loop error');
    });

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down...');

      // Stop loop
      loop.stop();

      // Stop Telegram bot
      telegramBot.stop();

      // Save state
      stateStore.setState({
        enabled: loop.isEnabled(),
        panic: riskEngine.getState().panicMode,
      });

      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    logger.info('✅ Bot is running. Use Telegram commands to control.');
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Fatal error during startup');
    process.exit(1);
  }
}

// Run
main();
