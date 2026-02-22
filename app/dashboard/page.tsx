'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardNav } from '@/components/dashboard-nav';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  TrendingUp, TrendingDown, Search, Filter, Trash2, Play, Pause, Users,
  X, Edit, Trash, Radio, ArrowUpRight, ArrowDownRight, DollarSign,
  BarChart3, Percent, Layers, ExternalLink, Copy, Check, Zap,
  ChevronDown, ChevronUp, Clock, Volume2, VolumeX
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Position {
  coin: string;
  size: number;
  entryPx: number;
  positionValue: number;
  unrealizedPnl: number;
  returnOnEquity: number;
  leverage: number;
}

interface FeedEvent {
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

interface Stats {
  totalPositions: number;
  totalValue: number;
  totalPnl: number;
  avgRoe: number;
}

export default function DashboardPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<FeedEvent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [marketFilter, setMarketFilter] = useState('');
  const [sideFilter, setSideFilter] = useState<'' | 'buy' | 'sell'>('');
  const [isPaused, setIsPaused] = useState(false);
  const [isWalletsOpen, setIsWalletsOpen] = useState(false);
  const [wallets, setWallets] = useState<{address: string, nickname?: string}[]>([]);
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newWalletNickname, setNewWalletNickname] = useState('');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [positionSort, setPositionSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'positionValue', dir: 'desc' });
  const [stats, setStats] = useState<Stats>({
    totalPositions: 0,
    totalValue: 0,
    totalPnl: 0,
    avgRoe: 0,
  });
  const [connected, setConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [, setTick] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playSound = useCallback((side: 'buy' | 'sell') => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (side === 'buy') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
        osc.type = 'sine';
      } else {
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(340, ctx.currentTime + 0.1);
        osc.type = 'sine';
      }

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Audio not available
    }
  }, [soundEnabled]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const socket = io('http://localhost:3001');

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    loadWallets();

    socket.on('initialFeed', (events: FeedEvent[]) => {
      setFeedEvents(events);
    });

    socket.on('positions', (data: Position[]) => {
      setPositions(data);
      const totalValue = data.reduce((sum, p) => sum + Math.abs(p.positionValue), 0);
      const totalPnl = data.reduce((sum, p) => sum + p.unrealizedPnl, 0);
      const avgRoe = data.length > 0
        ? data.reduce((sum, p) => sum + p.returnOnEquity, 0) / data.length
        : 0;
      setStats({ totalPositions: data.length, totalValue, totalPnl, avgRoe });
    });

    socket.on('feedEvent', (event: FeedEvent) => {
      if (!isPaused) {
        setFeedEvents((prev) => [event, ...prev].slice(0, 500));
        playSound(event.side);
      }
    });

    socket.on('feedCleared', () => {
      setFeedEvents([]);
    });

    return () => { socket.disconnect(); };
  }, [isPaused, playSound]);

  const loadWallets = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/leaders');
      const data = await response.json();
      const walletsData = (data.leaders || []).map((addr: string) => ({
        address: addr,
        nickname: data.nicknames?.[addr]
      }));
      setWallets(walletsData);
    } catch (error) {
      console.error('Failed to load wallets:', error);
    }
  };

  const handleAddWallet = async () => {
    if (!newWalletAddress.trim()) return;
    try {
      const response = await fetch('http://localhost:3001/api/leaders/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: newWalletAddress.trim(),
          nickname: newWalletNickname.trim() || undefined
        })
      });
      if (response.ok) {
        setNewWalletAddress('');
        setNewWalletNickname('');
        await loadWallets();
      }
    } catch (error) {
      console.error('Failed to add wallet:', error);
    }
  };

  const handleRemoveWallet = async (address: string) => {
    if (!confirm('Remove this wallet?')) return;
    try {
      const response = await fetch(`http://localhost:3001/api/leaders/${address}`, { method: 'DELETE' });
      if (response.ok) await loadWallets();
    } catch (error) {
      console.error('Failed to remove wallet:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  useEffect(() => {
    let filtered = feedEvents;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(event =>
        event.traderName?.toLowerCase().includes(term) ||
        event.traderAddress?.toLowerCase().includes(term)
      );
    }
    if (marketFilter) {
      filtered = filtered.filter(event =>
        event.market.toUpperCase().includes(marketFilter.toUpperCase())
      );
    }
    if (sideFilter) {
      filtered = filtered.filter(event => event.side === sideFilter);
    }
    setFilteredEvents(filtered);
  }, [feedEvents, searchTerm, marketFilter, sideFilter]);

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  };

  const formatCurrency = (num: number) => {
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return '$' + (num / 1000).toFixed(2) + 'K';
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const handleClearFeed = async () => {
    if (confirm('Clear all events?')) {
      try {
        await fetch('http://localhost:3001/api/feed/clear', { method: 'POST' });
        setFeedEvents([]);
      } catch (error) {
        console.error('Failed to clear feed:', error);
      }
    }
  };

  const sortedPositions = (list: Position[]) => {
    return [...list].sort((a, b) => {
      const key = positionSort.key as keyof Position;
      const aVal = key === 'positionValue' ? Math.abs(a[key] as number) : (a[key] as number);
      const bVal = key === 'positionValue' ? Math.abs(b[key] as number) : (b[key] as number);
      return positionSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  };

  const toggleSort = (key: string) => {
    setPositionSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    );
  };

  const longPositions = positions.filter(p => p.size > 0);
  const shortPositions = positions.filter(p => p.size < 0);
  const hasActiveFilters = searchTerm || marketFilter || sideFilter;

  return (
    <>
      <DashboardNav connected={connected} />
      <div className="ml-64 min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Radio className="h-6 w-6 text-primary" />
                </div>
                {connected && (
                  <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background live-dot" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Live Feed</h1>
                <p className="text-sm text-muted-foreground">
                  {connected ? 'Streaming real-time trades' : 'Connecting...'}
                  {isPaused && ' — Paused'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isPaused && (
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30 gap-1.5">
                  <Pause className="h-3 w-3" /> Paused
                </Badge>
              )}
              <Badge variant="outline" className="tabular-nums gap-1.5">
                <Layers className="h-3 w-3" />
                {filteredEvents.length} events
              </Badge>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-lg border bg-card p-1 gap-1">
              <Button
                variant={isPaused ? "default" : "ghost"}
                onClick={() => setIsPaused(!isPaused)}
                size="sm"
                className="gap-1.5 h-8"
              >
                {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
              <Button
                variant="ghost"
                onClick={handleClearFeed}
                size="sm"
                className="gap-1.5 h-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
              <div className="w-px h-5 bg-border" />
              <Button
                variant={soundEnabled ? "ghost" : "ghost"}
                onClick={() => setSoundEnabled(!soundEnabled)}
                size="sm"
                className={`gap-1.5 h-8 ${soundEnabled ? 'text-foreground' : 'text-muted-foreground'}`}
                title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
              >
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </Button>
            </div>

            <Button
              variant="outline"
              onClick={() => setIsWalletsOpen(true)}
              size="sm"
              className="gap-1.5 h-8"
            >
              <Users className="h-3.5 w-3.5" />
              Wallets
              {wallets.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{wallets.length}</Badge>
              )}
            </Button>

            <Button
              variant={showFilters ? "secondary" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              size="sm"
              className="gap-1.5 h-8"
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
              {hasActiveFilters && (
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Button>

            <div className="flex-1" />

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search trader..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 w-[200px] pl-8 text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Expandable Filters */}
          {showFilters && (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Market</span>
                <Input
                  placeholder="e.g. BTC, ETH..."
                  value={marketFilter}
                  onChange={(e) => setMarketFilter(e.target.value)}
                  className="h-8 w-[160px] text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Side</span>
                <div className="flex rounded-lg border bg-background p-0.5 gap-0.5">
                  {(['', 'buy', 'sell'] as const).map((side) => (
                    <button
                      key={side}
                      onClick={() => setSideFilter(side)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        sideFilter === side
                          ? side === 'buy'
                            ? 'bg-green-500/20 text-green-400'
                            : side === 'sell'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-secondary text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {side === '' ? 'All' : side === 'buy' ? 'Long' : 'Short'}
                    </button>
                  ))}
                </div>
              </div>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => { setSearchTerm(''); setMarketFilter(''); setSideFilter(''); }}
                >
                  Clear all
                </Button>
              )}
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Positions</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Layers className="h-4 w-4 text-blue-400" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums">{stats.totalPositions}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="text-green-400">{longPositions.length} long</span>
                  {' · '}
                  <span className="text-red-400">{shortPositions.length} short</span>
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Value</span>
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <DollarSign className="h-4 w-4 text-purple-400" />
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums text-purple-400">
                  {formatCurrency(stats.totalValue)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Combined notional</p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unrealized PnL</span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stats.totalPnl >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    {stats.totalPnl >= 0
                      ? <TrendingUp className="h-4 w-4 text-green-400" />
                      : <TrendingDown className="h-4 w-4 text-red-400" />
                    }
                  </div>
                </div>
                <div className={`text-2xl font-bold tabular-nums ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.totalPnl >= 0 ? '+' : ''}{formatCurrency(stats.totalPnl)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Profit / Loss</p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg ROE</span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stats.avgRoe >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    <Percent className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className={`text-2xl font-bold tabular-nums ${stats.avgRoe >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.avgRoe >= 0 ? '+' : ''}{(stats.avgRoe * 100).toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">Return on equity</p>
              </CardContent>
            </Card>
          </div>

          {/* Live Feed */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">Trade Activity</CardTitle>
                  {connected && !isPaused && (
                    <div className="flex items-center gap-1.5 text-xs text-green-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 live-dot" />
                      LIVE
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {filteredEvents.length} / {feedEvents.length} events
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div ref={feedRef} className="space-y-1 overflow-y-auto max-h-[520px] pr-1">
                {filteredEvents.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mx-auto mb-4">
                      <Radio className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {feedEvents.length === 0 ? 'Waiting for trades...' : 'No events matching filters'}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {feedEvents.length === 0
                        ? 'New trades will appear here in real-time'
                        : 'Try adjusting your search or filters'
                      }
                    </p>
                  </div>
                ) : (
                  filteredEvents.map((event, idx) => {
                    const market = event.market.split('-')[0];
                    const isBuy = event.side === 'buy';
                    const isModification = event.previousSize !== undefined && event.newSize !== undefined;
                    const qty = isModification
                      ? Math.abs((event.newSize || 0) - (event.previousSize || 0))
                      : event.qty;
                    const isNew = idx === 0;

                    return (
                      <div
                        key={event.id}
                        className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-border/50 hover:bg-accent/30 transition-all ${isNew ? 'feed-event-enter' : ''}`}
                      >
                        {/* Side indicator */}
                        <div className="flex-shrink-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            isBuy ? 'bg-green-500/10' : 'bg-red-500/10'
                          }`}>
                            {isBuy
                              ? <ArrowUpRight className="h-4 w-4 text-green-400" />
                              : <ArrowDownRight className="h-4 w-4 text-red-400" />
                            }
                          </div>
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          {/* Trader */}
                          {event.traderAddress ? (
                            <a
                              href={`https://hypurrscan.io/address/${event.traderAddress}#txs`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-sm hover:text-primary transition-colors truncate max-w-[140px]"
                              title={event.traderName}
                            >
                              {event.traderName}
                            </a>
                          ) : (
                            <span className="font-medium text-sm truncate max-w-[140px]">{event.traderName}</span>
                          )}

                          {/* Action */}
                          <span className={`text-xs font-medium ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
                            {isBuy ? 'bought' : 'sold'}
                          </span>

                          {/* Quantity */}
                          <span className="font-semibold text-sm tabular-nums">{formatNumber(qty)}</span>

                          {/* Market badge */}
                          <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 font-mono">
                            {market}
                          </Badge>

                          {/* Price */}
                          {event.price && (
                            <>
                              <span className="text-muted-foreground text-xs">@</span>
                              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                ${event.price.toFixed(2)}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Right side info */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Notional */}
                          <span className="font-semibold text-sm tabular-nums text-purple-400">
                            {formatCurrency(event.notionalUsd)}
                          </span>

                          {/* Side badge */}
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 h-5 font-semibold border ${
                              isBuy
                                ? 'text-green-400 border-green-500/30 bg-green-500/5'
                                : 'text-red-400 border-red-500/30 bg-red-500/5'
                            }`}
                          >
                            {isBuy ? 'LONG' : 'SHORT'}
                          </Badge>

                          {event.isPro && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-yellow-400 border-yellow-500/30 bg-yellow-500/5">
                              <Zap className="h-2.5 w-2.5 mr-0.5" />
                              PRO
                            </Badge>
                          )}

                          {/* Timestamp */}
                          <span className="text-[11px] text-muted-foreground tabular-nums min-w-[52px] text-right">
                            {getTimeAgo(event.ts)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Positions */}
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="all" className="gap-1.5 data-[state=active]:bg-background">
                All <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-transparent">{positions.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="long" className="gap-1.5 data-[state=active]:bg-background">
                <span className="text-green-400">Long</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-transparent">{longPositions.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="short" className="gap-1.5 data-[state=active]:bg-background">
                <span className="text-red-400">Short</span>
                <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-transparent">{shortPositions.length}</Badge>
              </TabsTrigger>
            </TabsList>

            {(['all', 'long', 'short'] as const).map((tab) => {
              const list = tab === 'all' ? positions : tab === 'long' ? longPositions : shortPositions;
              return (
                <TabsContent key={tab} value={tab} className="mt-3">
                  <Card className="border-border/50">
                    <CardContent className="p-0">
                      <PositionsTable
                        positions={sortedPositions(list)}
                        sort={positionSort}
                        onSort={toggleSort}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>

          {/* Manage Wallets Dialog */}
          <Dialog open={isWalletsOpen} onOpenChange={(open) => {
            setIsWalletsOpen(open);
            if (open) loadWallets();
          }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Manage Wallets
                </DialogTitle>
                <DialogDescription>
                  Follow trader wallets to copy their positions
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Add form */}
                <div className="space-y-3 p-4 rounded-lg border-2 border-dashed border-border/50">
                  <Input
                    placeholder="0x... wallet address"
                    value={newWalletAddress}
                    onChange={(e) => setNewWalletAddress(e.target.value)}
                    className="font-mono text-sm h-9"
                  />
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nickname (optional)"
                      value={newWalletNickname}
                      onChange={(e) => setNewWalletNickname(e.target.value)}
                      className="text-sm h-9"
                    />
                    <Button
                      onClick={handleAddWallet}
                      size="sm"
                      className="h-9 px-4"
                      disabled={!newWalletAddress.trim()}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                {/* Wallet list */}
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {wallets.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No wallets yet</p>
                  ) : (
                    wallets.map((wallet) => (
                      <div
                        key={wallet.address}
                        className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/30 transition-colors group"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-primary">
                            {(wallet.nickname || wallet.address.slice(2, 4)).slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          {wallet.nickname && (
                            <span className="text-sm font-medium block">{wallet.nickname}</span>
                          )}
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-muted-foreground truncate">
                              {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                            </span>
                            <button
                              onClick={() => copyToClipboard(wallet.address)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {copiedAddress === wallet.address
                                ? <Check className="h-3 w-3 text-green-400" />
                                : <Copy className="h-3 w-3" />
                              }
                            </button>
                            <a
                              href={`https://hypurrscan.io/address/${wallet.address}#txs`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-primary transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRemoveWallet(wallet.address)}
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </>
  );
}

function PositionsTable({ positions, sort, onSort }: {
  positions: Position[];
  sort: { key: string; dir: 'asc' | 'desc' };
  onSort: (key: string) => void;
}) {
  if (positions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">No positions</p>
      </div>
    );
  }

  const SortIcon = ({ col }: { col: string }) => {
    if (sort.key !== col) return null;
    return sort.dir === 'desc'
      ? <ChevronDown className="h-3 w-3 ml-1 inline" />
      : <ChevronUp className="h-3 w-3 ml-1 inline" />;
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return '$' + price.toFixed(4);
    return '$' + price.toFixed(6);
  };

  return (
    <div className="rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border/50">
            <TableHead className="text-xs">Coin</TableHead>
            <TableHead className="text-xs cursor-pointer select-none" onClick={() => onSort('size')}>
              Size <SortIcon col="size" />
            </TableHead>
            <TableHead className="text-xs">Entry</TableHead>
            <TableHead className="text-xs cursor-pointer select-none" onClick={() => onSort('positionValue')}>
              Value <SortIcon col="positionValue" />
            </TableHead>
            <TableHead className="text-xs cursor-pointer select-none" onClick={() => onSort('unrealizedPnl')}>
              PnL <SortIcon col="unrealizedPnl" />
            </TableHead>
            <TableHead className="text-xs cursor-pointer select-none" onClick={() => onSort('returnOnEquity')}>
              ROE <SortIcon col="returnOnEquity" />
            </TableHead>
            <TableHead className="text-xs">Lev.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((pos, idx) => (
            <TableRow key={idx} className="border-border/30 hover:bg-accent/20">
              <TableCell className="py-2.5">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${pos.size > 0 ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className="font-medium text-sm">{pos.coin}</span>
                </div>
              </TableCell>
              <TableCell className="py-2.5">
                <span className={`text-sm font-mono tabular-nums ${pos.size > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {pos.size > 0 ? '+' : ''}{pos.size.toFixed(4)}
                </span>
              </TableCell>
              <TableCell className="py-2.5">
                <span className="text-sm font-mono tabular-nums text-muted-foreground">{formatPrice(pos.entryPx)}</span>
              </TableCell>
              <TableCell className="py-2.5">
                <span className="text-sm font-mono tabular-nums">${Math.abs(pos.positionValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </TableCell>
              <TableCell className="py-2.5">
                <span className={`text-sm font-mono tabular-nums ${pos.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                </span>
              </TableCell>
              <TableCell className="py-2.5">
                <span className={`text-sm font-mono tabular-nums ${pos.returnOnEquity >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {pos.returnOnEquity >= 0 ? '+' : ''}{(pos.returnOnEquity * 100).toFixed(2)}%
                </span>
              </TableCell>
              <TableCell className="py-2.5">
                <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 tabular-nums font-mono">
                  {pos.leverage.toFixed(1)}x
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
