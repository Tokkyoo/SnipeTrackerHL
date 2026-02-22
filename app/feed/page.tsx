'use client';

import { useEffect, useState } from 'react';
import io from 'socket.io-client';

interface Trade {
  timestamp: string;
  trader: string;
  coin: string;
  side: 'buy' | 'sell';
  size: number;
  price: number;
  value: number;
  executed: boolean;
  reason?: string;
}

export default function FeedPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io('http://localhost:3001');

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('trade', (trade: Trade) => {
      setTrades((prev) => [trade, ...prev].slice(0, 100)); // Keep last 100 trades
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Live Trading Feed</h1>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`}
              />
              <span className="text-sm text-gray-400">
                {connected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-4">
          <button className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-blue-500 transition">
            All Trades
          </button>
          <button className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-green-500 transition">
            Executed
          </button>
          <button className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-red-500 transition">
            Rejected
          </button>
        </div>

        {/* Trade Feed */}
        <div className="space-y-4">
          {trades.length === 0 ? (
            <div className="p-12 text-center bg-gray-800 rounded-lg border border-gray-700">
              <p className="text-gray-400">Waiting for trades...</p>
            </div>
          ) : (
            trades.map((trade, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg border transition-all ${
                  trade.executed
                    ? 'bg-gray-800 border-gray-700 hover:border-green-500'
                    : 'bg-gray-800 border-red-700 hover:border-red-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        trade.executed ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-blue-400">
                          {trade.coin}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded ${
                            trade.side === 'buy'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {trade.side.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        Size: {trade.size.toFixed(4)} @ ${trade.price.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold">
                      ${trade.value.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(trade.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                {!trade.executed && trade.reason && (
                  <div className="mt-2 p-2 bg-red-500/10 rounded text-sm text-red-400">
                    ⚠️ {trade.reason}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
