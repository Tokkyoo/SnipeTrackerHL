/**
 * Position represents a perpetual position on Hyperliquid
 */
export interface Position {
  coin: string;
  size: number; // Positive for long, negative for short, 0 for no position
  entryPx?: number;
  leverage?: number;
  unrealizedPnl?: number;
  marginUsed?: number;
  liquidationPx?: number;
  returnOnEquity?: number;
  cumFunding?: number;
  updatedAt: number; // timestamp in ms
}

/**
 * Order side
 */
export type OrderSide = 'buy' | 'sell';

/**
 * Time In Force
 */
export type TimeInForce = 'IOC' | 'GTC';

/**
 * Order request to be sent to exchange
 */
export interface OrderRequest {
  coin: string;
  side: OrderSide;
  size: number; // abs value
  tif: TimeInForce;
  reduceOnly: boolean;
  price?: number; // optional limit price, if not provided = market order
}

/**
 * Order result from exchange
 */
export interface OrderResult {
  success: boolean;
  orderId?: string;
  filledSize?: number;
  avgPrice?: number;
  error?: string;
}

/**
 * Market data for a coin
 */
export interface MarketData {
  coin: string;
  markPrice: number;
  lastPrice: number;
  timestamp: number;
}
