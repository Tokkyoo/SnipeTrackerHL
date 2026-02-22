'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardNav } from '@/components/dashboard-nav';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  TrendingUp, TrendingDown, Search, Filter, Trash2, Users,
  X, Trash, Radio, ArrowUpRight, ArrowDownRight, DollarSign,
  Percent, Layers, ExternalLink, Copy, Check,
  ChevronDown, ChevronUp, Volume2, VolumeX
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePositions } from '@/hooks/use-positions';
import { useWallets } from '@/hooks/use-wallets';

interface Position {
  coin: string;
  size: number;
  entryPx: number;
  positionValue: number;
  unrealizedPnl: number;
  returnOnEquity: number;
  leverage: number;
  traderName?: string;
  traderAddress?: string;
}

interface FeedEvent {
  id: string;
  ts: number;
  traderName: string;
  traderAddress?: string;
  market: string;
  side: 'buy' | 'sell';
  qty: number;
  notionalUsd: number;
}

export default function DashboardPage() {
  const { allPositions, isLive } = usePositions(3000);
  const { wallets, addWallet, removeWallet } = useWallets();
  const positions: Position[] = allPositions;

  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [marketFilter, setMarketFilter] = useState('');
  const [sideFilter, setSideFilter] = useState<'' | 'buy' | 'sell'>('');
  const [isWalletsOpen, setIsWalletsOpen] = useState(false);
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newWalletNickname, setNewWalletNickname] = useState('');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [positionSort, setPositionSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'positionValue', dir: 'desc' });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevPositionsRef = useRef<Map<string, Position>>(new Map());

  const connected = isLive;

  const stats = useMemo(() => {
    const totalValue = positions.reduce((sum, p) => sum + Math.abs(p.positionValue), 0);
    const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const avgRoe = positions.length > 0
      ? positions.reduce((sum, p) => sum + p.returnOnEquity, 0) / positions.length
      : 0;
    return { totalPositions: positions.length, totalValue, totalPnl, avgRoe };
  }, [positions]);

  const playSound = useCallback((side: 'buy' | 'sell') => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (side === 'buy') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      } else {
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(340, ctx.currentTime + 0.1);
      }
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch { /* Audio not available */ }
  }, [soundEnabled]);

  // Detect position changes and generate feed events
  useEffect(() => {
    const currentMap = new Map<string, Position>();
    for (const pos of positions) {
      const key = `${pos.traderAddress || 'unknown'}-${pos.coin}`;
      currentMap.set(key, pos);
    }

    const prevMap = prevPositionsRef.current;
    const newEvents: FeedEvent[] = [];

    for (const [key, pos] of currentMap) {
      const prev = prevMap.get(key);
      if (!prev) {
        newEvents.push({
          id: `${key}-${Date.now()}`,
          ts: Date.now(),
          traderName: pos.traderName || 'Unknown',
          traderAddress: pos.traderAddress,
          market: `${pos.coin}-PERP`,
          side: pos.size > 0 ? 'buy' : 'sell',
          qty: Math.abs(pos.size),
          notionalUsd: Math.abs(pos.positionValue),
        });
      } else if (Math.abs(pos.size - prev.size) > 0.0001) {
        const sizeChange = pos.size - prev.size;
        newEvents.push({
          id: `${key}-${Date.now()}`,
          ts: Date.now(),
          traderName: pos.traderName || 'Unknown',
          traderAddress: pos.traderAddress,
          market: `${pos.coin}-PERP`,
          side: sizeChange > 0 ? 'buy' : 'sell',
          qty: Math.abs(sizeChange),
          notionalUsd: Math.abs(sizeChange * pos.entryPx),
        });
      }
    }

    for (const [key, prev] of prevMap) {
      if (!currentMap.has(key)) {
        newEvents.push({
          id: `${key}-close-${Date.now()}`,
          ts: Date.now(),
          traderName: prev.traderName || 'Unknown',
          traderAddress: prev.traderAddress,
          market: `${prev.coin}-PERP`,
          side: prev.size > 0 ? 'sell' : 'buy',
          qty: Math.abs(prev.size),
          notionalUsd: Math.abs(prev.positionValue),
        });
      }
    }

    if (newEvents.length > 0 && prevMap.size > 0) {
      setFeedEvents(prev => [...newEvents, ...prev].slice(0, 500));
      newEvents.forEach(e => playSound(e.side));
    }

    prevPositionsRef.current = currentMap;
  }, [positions, playSound]);

  const handleAddWallet = async () => {
    if (!newWalletAddress.trim()) return;
    try {
      await addWallet(newWalletAddress.trim(), newWalletNickname.trim() || undefined);
      setNewWalletAddress('');
      setNewWalletNickname('');
    } catch (error) {
      console.error('Failed to add wallet:', error);
    }
  };

  const handleRemoveWallet = async (id: string) => {
    if (!confirm('Remove this wallet?')) return;
    try {
      await removeWallet(id);
    } catch (error) {
      console.error('Failed to remove wallet:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const filteredEvents = useMemo(() => {
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
    return filtered;
  }, [feedEvents, searchTerm, marketFilter, sideFilter]);

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
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

  const handleClearFeed = () => {
    if (confirm('Clear all events?')) setFeedEvents([]);
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
                  {connected ? 'Polling every 3s' : 'Connecting...'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
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
                variant="ghost"
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
              {hasActiveFilters && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
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
                          ? side === 'buy' ? 'bg-green-500/20 text-green-400'
                            : side === 'sell' ? 'bg-red-500/20 text-red-400'
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
                  {connected && (
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
                        ? 'Add wallets and position changes will appear here'
                        : 'Try adjusting your search or filters'
                      }
                    </p>
                  </div>
                ) : (
                  filteredEvents.map((event, idx) => {
                    const market = event.market.split('-')[0];
                    const isBuy = event.side === 'buy';
                    const isNew = idx === 0;

                    return (
                      <div
                        key={event.id}
                        className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-border/50 hover:bg-accent/30 transition-all ${isNew ? 'feed-event-enter' : ''}`}
                      >
                        <div className="flex-shrink-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isBuy ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                            {isBuy
                              ? <ArrowUpRight className="h-4 w-4 text-green-400" />
                              : <ArrowDownRight className="h-4 w-4 text-red-400" />
                            }
                          </div>
                        </div>

                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
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

                          <span className={`text-xs font-medium ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
                            {isBuy ? 'bought' : 'sold'}
                          </span>

                          <span className="font-semibold text-sm tabular-nums">{formatNumber(event.qty)}</span>

                          <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 font-mono">
                            {market}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-semibold text-sm tabular-nums text-purple-400">
                            {formatCurrency(event.notionalUsd)}
                          </span>

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
          <Dialog open={isWalletsOpen} onOpenChange={setIsWalletsOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Manage Wallets
                </DialogTitle>
                <DialogDescription>
                  Track trader wallets to monitor their positions
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
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

                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {wallets.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No wallets yet</p>
                  ) : (
                    wallets.map((wallet) => (
                      <div
                        key={wallet.id}
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
                          onClick={() => handleRemoveWallet(wallet.id)}
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
            <TableHead className="text-xs">Trader</TableHead>
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
                <span className="text-xs text-muted-foreground truncate max-w-[100px] block">
                  {pos.traderName || '-'}
                </span>
              </TableCell>
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
