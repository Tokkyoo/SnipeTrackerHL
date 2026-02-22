import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { computeMarketPulse, MarketPulseRow } from '../analysis/marketPulse';
import { getMultiplePositionBreakdowns, PositionBreakdown } from '../analysis/positionBreakdown';

export interface FeedEvent {
  id: string;
  ts: number;
  traderName: string;
  traderAddress?: string;
  market: string;
  side: 'buy' | 'sell';
  qty: number;
  price?: number;
  notionalUsd: number;
  source?: string;
  isPro?: boolean;
  previousSize?: number;
  newSize?: number;
}

export interface DashboardData {
  positions: any[];
  leaders: any[];
  stats: {
    totalPnL: number;
    openPositions: number;
    todayTrades: number;
    winRate: number;
  };
  recentTrades: any[];
  feedEvents: FeedEvent[];
}

export class DashboardServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private port: number;
  private data: DashboardData;
  private onLeadersChangeCallback?: () => void;
  private marketPulseInterval?: NodeJS.Timeout;
  private marketPulseWindowMs: number = 5 * 60 * 1000; // 5 minutes default

  constructor(port: number = 3001) {
    this.port = port;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.data = {
      positions: [],
      leaders: [],
      stats: {
        totalPnL: 0,
        openPositions: 0,
        todayTrades: 0,
        winRate: 0
      },
      recentTrades: [],
      feedEvents: []
    };

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes() {
    // Enable CORS for frontend
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Parse JSON body
    this.app.use(express.json());
    
    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../../public')));

    // Root route - serve index.html
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/index.html'));
    });

    // API endpoints
    this.app.get('/api/data', (req, res) => {
      res.json(this.data);
    });

    this.app.get('/api/state', (req, res) => {
      try {
        const statePath = path.join(process.cwd(), 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        res.json(state);
      } catch (error) {
        res.status(500).json({ error: 'Failed to read state' });
      }
    });

    // GET endpoint for open interest data
    this.app.get('/api/open-interest/:coin', async (req, res) => {
      try {
        const { coin } = req.params;
        const { InfoClient } = await import('../hyperliquid/infoClient');
        const infoClient = new InfoClient();
        const data = await infoClient.getOpenInterest(coin);
        
        if (!data) {
          res.status(404).json({ error: 'No data found for this coin' });
          return;
        }
        
        res.json(data);
      } catch (error: any) {
        console.error('Error fetching open interest:', error);
        res.status(500).json({ error: 'Failed to fetch open interest data' });
      }
    });

    // POST endpoint to receive events from bot
    this.app.post('/api/events', (req, res) => {
      try {
        const event: FeedEvent = req.body;
        
        // Validate event
        if (!event.id || !event.ts || !event.traderName || !event.market || !event.side) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // Add to feed
        this.addFeedEvent(event);
        
        res.json({ success: true, event });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET endpoint to retrieve all feed events
    this.app.get('/api/feed', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 100;
      res.json(this.data.feedEvents.slice(0, limit));
    });

    // GET endpoint for market pulse
    this.app.get('/api/market-pulse', (req, res) => {
      const windowMs = parseInt(req.query.window as string) || this.marketPulseWindowMs;
      const weighted = req.query.weighted === 'true';
      const pulse = computeMarketPulse(this.data.feedEvents, windowMs, weighted);
      res.json(pulse);
    });

    // POST endpoint to clear feed
    this.app.post('/api/feed/clear', (req, res) => {
      this.data.feedEvents = [];
      this.broadcast('feedCleared', {});
      res.json({ success: true });
    });

    // POST endpoint to add leader
    this.app.post('/api/leaders/add', (req, res) => {
      try {
        const { address, nickname } = req.body;
        
        if (!address) {
          return res.status(400).json({ error: 'Address is required' });
        }

        // Read state.json from project root
        const statePath = path.join(process.cwd(), 'state.json');
        console.log('Reading state from:', statePath);
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        
        // Initialize leaders if not exists
        state.leaders = state.leaders || [];
        
        // Add to leaders if not already there
        if (!state.leaders.includes(address)) {
          state.leaders.push(address);
        }
        
        // Add nickname if provided
        if (nickname) {
          state.leaderNicknames = state.leaderNicknames || {};
          state.leaderNicknames[address] = nickname;
        }
        
        // Save state.json
        console.log('Saving state to:', statePath);
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        
        // Notify bot to reload leaders
        if (this.onLeadersChangeCallback) {
          this.onLeadersChangeCallback();
        }
        
        res.json({ success: true, leaders: state.leaders });
      } catch (error: any) {
        console.error('Error adding leader:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE endpoint to remove leader
    this.app.delete('/api/leaders/:address', (req, res) => {
      try {
        const { address } = req.params;
        
        // Read state.json
        const statePath = path.join(process.cwd(), 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        
        // Initialize leaders if not exists
        state.leaders = state.leaders || [];
        
        // Remove from leaders
        state.leaders = state.leaders.filter(
          (addr: string) => addr.toLowerCase() !== address.toLowerCase()
        );
        
        // Remove nickname if exists
        if (state.leaderNicknames && state.leaderNicknames[address]) {
          delete state.leaderNicknames[address];
        }
        
        // Save state.json
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        
        // Notify bot to reload leaders
        if (this.onLeadersChangeCallback) {
          this.onLeadersChangeCallback();
        }
        
        res.json({ success: true, leaders: state.leaders });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET endpoint to get current leaders
    this.app.get('/api/leaders', (req, res) => {
      try {
        const statePath = path.join(process.cwd(), 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        res.json({ 
          leaders: state.leaders || [],
          nicknames: state.leaderNicknames || {}
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET endpoint for position breakdown (long/short ratio)
    this.app.get('/api/position-breakdown', async (req, res) => {
      try {
        const coins = req.query.coins as string | undefined;
        
        if (!coins) {
          return res.status(400).json({ error: 'coins parameter required' });
        }
        
        const coinList = coins.split(',').map(c => c.trim().toUpperCase());
        const breakdowns = await getMultiplePositionBreakdowns(coinList);
        
        res.json(breakdowns);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET endpoint for all leaders positions
    this.app.get('/api/leaders/positions', async (req, res) => {
      try {
        const statePath = path.join(process.cwd(), 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        const leaders = state.leaders || [];
        const nicknames = state.leaderNicknames || {};
        
        // Import InfoClient
        const { InfoClient } = await import('../hyperliquid/infoClient');
        const infoClient = new InfoClient();
        
        // Fetch positions for each leader
        const leadersData = await Promise.all(
          leaders.map(async (address: string) => {
            try {
              const positions = await infoClient.getPositions(address);
              
              // Calculate total PNL
              let totalPnl = 0;
              const formattedPositions = positions.map((pos: any) => {
                totalPnl += pos.unrealizedPnl || 0;
                
                return {
                  coin: pos.coin,
                  size: pos.size,
                  entryPrice: pos.entryPx,
                  unrealizedPnl: pos.unrealizedPnl || 0,
                  leverage: pos.leverage || '1',
                  marginUsed: pos.marginUsed || 0,
                  liquidationPx: pos.liquidationPx || 0,
                  returnOnEquity: pos.returnOnEquity || 0,
                  cumFunding: pos.cumFunding || 0
                };
              });
              
              // Get current prices for all positions
              if (formattedPositions.length > 0) {
                const coins = formattedPositions.map((p: any) => p.coin);
                const marketData = await infoClient.getMarketData(coins);
                
                formattedPositions.forEach((pos: any) => {
                  const data = marketData.get(pos.coin);
                  pos.currentPrice = data?.markPrice || 0;
                  pos.notionalValue = Math.abs(pos.size) * (data?.markPrice || 0);
                  pos.funding = pos.cumFunding; // Use cumulative funding from API
                });
              }
              
              return {
                address,
                nickname: nicknames[address] || null,
                totalPnl,
                positions: formattedPositions,
                positionCount: formattedPositions.length
              };
            } catch (error) {
              console.error(`Error fetching positions for ${address}:`, error);
              return {
                address,
                nickname: nicknames[address] || null,
                error: 'Failed to fetch positions',
                totalPnl: 0,
                positions: [],
                positionCount: 0
              };
            }
          })
        );
        
        res.json({ leaders: leadersData });
      } catch (error: any) {
        console.error('Error in /api/leaders/positions:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // PATCH endpoint to update leader nickname
    this.app.patch('/api/leaders/:address', (req, res) => {
      try {
        const { address } = req.params;
        const { nickname } = req.body;
        
        // Read state.json
        const statePath = path.join(process.cwd(), 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        
        // Check if leader exists
        if (!state.leaders || !state.leaders.includes(address)) {
          return res.status(404).json({ error: 'Leader not found' });
        }
        
        // Update nickname
        state.leaderNicknames = state.leaderNicknames || {};
        if (nickname && nickname.trim()) {
          state.leaderNicknames[address] = nickname.trim();
        } else {
          // Remove nickname if empty
          delete state.leaderNicknames[address];
        }
        
        // Save state.json
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        
        res.json({ success: true, nickname: state.leaderNicknames[address] || null });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  private setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log('Dashboard client connected');
      
      // Send initial data
      socket.emit('initialData', this.data);
      
      // Send initial feed
      socket.emit('initialFeed', this.data.feedEvents);
      
      // Send initial market pulse immediately
      const initialPulse = computeMarketPulse(this.data.feedEvents, this.marketPulseWindowMs);
      socket.emit('marketPulseUpdate', initialPulse);

      socket.on('disconnect', () => {
        console.log('Dashboard client disconnected');
      });
    });
  }

  public updatePositions(positions: any[]) {
    this.data.positions = positions;
    this.data.stats.openPositions = positions.filter(p => p.size !== 0).length;
    this.broadcast('positionsUpdate', positions);
  }

  public updateLeaders(leaders: any[]) {
    this.data.leaders = leaders;
    this.broadcast('leadersUpdate', leaders);
  }

  public addTrade(trade: any) {
    this.data.recentTrades.unshift({
      ...trade,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 50 trades
    if (this.data.recentTrades.length > 50) {
      this.data.recentTrades = this.data.recentTrades.slice(0, 50);
    }

    this.data.stats.todayTrades++;
    this.broadcast('newTrade', trade);
    
    // Load nicknames from state.json
    let traderName = trade.leader || 'Unknown';
    const traderAddress = trade.leader;
    
    try {
      const statePath = path.join(process.cwd(), 'state.json');
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      if (state.leaderNicknames && traderAddress && state.leaderNicknames[traderAddress]) {
        traderName = state.leaderNicknames[traderAddress];
      }
    } catch (error) {
      // Ignore error, use address as name
    }
    
    // Also add to feed with proper format
    const feedEvent: FeedEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ts: Date.now(),
      traderName: traderName,
      traderAddress: traderAddress,
      market: `${trade.coin}-PERP`,
      side: trade.side,
      qty: Math.abs(trade.size || 0),
      price: trade.price || 0,
      notionalUsd: Math.abs(trade.size || 0) * (trade.price || 0),
      source: 'bot',
      isPro: false,
      previousSize: trade.previousSize,
      newSize: trade.newSize
    };
    this.addFeedEvent(feedEvent);
  }

  public updateStats(stats: Partial<DashboardData['stats']>) {
    this.data.stats = { ...this.data.stats, ...stats };
    this.broadcast('statsUpdate', this.data.stats);
  }

  public addFeedEvent(event: FeedEvent) {
    // Add to beginning of array (newest first)
    this.data.feedEvents.unshift(event);
    
    // Keep only last 500 events
    if (this.data.feedEvents.length > 500) {
      this.data.feedEvents = this.data.feedEvents.slice(0, 500);
    }

    // Broadcast to all connected clients
    this.broadcast('feedEvent', event);
  }

  private broadcast(event: string, data: any) {
    this.io.emit(event, data);
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`📊 Dashboard running at http://localhost:${this.port}`);
        
        // Start market pulse broadcast interval (every 10 seconds)
        this.startMarketPulseBroadcast();
        
        resolve();
      });
    });
  }

  private startMarketPulseBroadcast() {
    // Broadcast market pulse every 10 seconds
    this.marketPulseInterval = setInterval(() => {
      const pulse = computeMarketPulse(this.data.feedEvents, this.marketPulseWindowMs);
      this.broadcast('marketPulseUpdate', pulse);
    }, 10000);
  }

  public stop() {
    if (this.marketPulseInterval) {
      clearInterval(this.marketPulseInterval);
    }
    this.server.close();
  }

  public getIO(): SocketIOServer {
    return this.io;
  }

  public onLeadersChange(callback: () => void) {
    this.onLeadersChangeCallback = callback;
  }
}
