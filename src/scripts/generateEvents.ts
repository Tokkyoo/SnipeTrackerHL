/**
 * Fake Event Generator for Testing Live Feed
 * 
 * Usage:
 * - node dist/scripts/generateEvents.js
 * - Set INTERVAL_MS to control event frequency
 */

const traders = [
  { name: 'nexus', address: '0x1234...5678', isPro: true },
  { name: 'whale_hunter', address: '0xabcd...ef00', isPro: true },
  { name: 'degen_lord', address: '0x9876...5432', isPro: false },
  { name: 'loracle', address: '0x8def...2dae', isPro: true },
  { name: 'LE SHORTER', address: '0xa87a...71b7', isPro: true },
  { name: 'crypto_chad', address: '0x5555...6666', isPro: false },
  { name: 'moon_boi', address: '0x7777...8888', isPro: false },
];

const markets = ['HYPE', 'ETH', 'SOL', 'BTC', 'AVAX', 'DOGE', 'SUI', 'APT'];

let eventCounter = 0;

function generateRandomEvent() {
  const trader = traders[Math.floor(Math.random() * traders.length)];
  const market = markets[Math.floor(Math.random() * markets.length)];
  const side = Math.random() > 0.5 ? 'buy' : 'sell';
  
  // Generate realistic quantities
  let qty: number;
  let price: number;
  let notionalUsd: number;

  if (market === 'BTC') {
    qty = Math.random() * 10 + 0.1; // 0.1 to 10 BTC
    price = 95000 + Math.random() * 5000;
    notionalUsd = qty * price;
  } else if (market === 'ETH') {
    qty = Math.random() * 500 + 10; // 10 to 500 ETH
    price = 2900 + Math.random() * 200;
    notionalUsd = qty * price;
  } else if (market === 'SOL') {
    qty = Math.random() * 5000 + 100; // 100 to 5000 SOL
    price = 120 + Math.random() * 20;
    notionalUsd = qty * price;
  } else if (market === 'HYPE') {
    qty = Math.random() * 50000 + 1000; // 1000 to 50000 HYPE
    price = 25 + Math.random() * 5;
    notionalUsd = qty * price;
  } else {
    qty = Math.random() * 10000 + 100;
    price = Math.random() * 50 + 1;
    notionalUsd = qty * price;
  }

  return {
    id: `${Date.now()}-${eventCounter++}`,
    ts: Date.now(),
    traderName: trader.name,
    traderAddress: trader.address,
    market: `${market}-PERP`,
    side: side,
    qty: parseFloat(qty.toFixed(4)),
    price: parseFloat(price.toFixed(2)),
    notionalUsd: parseFloat(notionalUsd.toFixed(2)),
    source: 'telegram',
    isPro: trader.isPro
  };
}

async function sendEvent(event: any) {
  try {
    const response = await fetch('http://localhost:3000/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (response.ok) {
      const side = event.side === 'buy' ? '🟢' : '🔴';
      console.log(`${side} ${event.traderName} ${event.side} ${event.qty} ${event.market} ($${event.notionalUsd.toFixed(0)})`);
    } else {
      console.error('Failed to send event:', response.statusText);
    }
  } catch (error) {
    console.error('Error sending event:', error);
  }
}

async function main() {
  const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '3000'); // Default: 3 seconds
  const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '1'); // Events per interval

  console.log('🚀 Starting fake event generator...');
  console.log(`⏱️  Interval: ${INTERVAL_MS}ms`);
  console.log(`📦 Batch size: ${BATCH_SIZE}`);
  console.log(`🎯 Target: http://localhost:3000/api/events\n`);

  // Generate initial batch
  for (let i = 0; i < 5; i++) {
    const event = generateRandomEvent();
    await sendEvent(event);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Continuous generation
  setInterval(async () => {
    for (let i = 0; i < BATCH_SIZE; i++) {
      const event = generateRandomEvent();
      await sendEvent(event);
      
      if (BATCH_SIZE > 1 && i < BATCH_SIZE - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }, INTERVAL_MS);
}

main().catch(console.error);
