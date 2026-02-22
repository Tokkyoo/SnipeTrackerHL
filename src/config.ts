import dotenv from 'dotenv';

dotenv.config();

export type CopyMode = 'full' | 'entry-only' | 'signals-only';

export interface Config {
  // Leaders & Follower
  leaderAddresses: string[];
  followerPrivateKey: string;

  // Trading parameters
  ratioDefault: number;
  notionalCapPerOrderUsd: number;
  maxLeverage: number;
  maxTotalNotionalUsd: number;
  cooldownMsPerCoin: number;
  pollIntervalMs: number;
  copyModeDefault: CopyMode;

  // Telegram
  telegramBotToken: string;
  telegramAllowedChatIds: number[];
  minNotionalForNotification: number; // Minimum notional to send notification

  // Mode
  mode: 'paper' | 'live';
  tifDefault: 'IOC' | 'GTC';
  dryRunLogOnly: boolean;

  // State
  stateFile: string;
}

function parseEnvArray(envVar: string | undefined, defaultVal: string[]): string[] {
  if (!envVar) return defaultVal;
  return envVar.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function parseEnvNumberArray(envVar: string | undefined, defaultVal: number[]): number[] {
  if (!envVar) return defaultVal;
  return envVar.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

export function loadConfig(): Config {
  const leaderAddresses = parseEnvArray(process.env.LEADER_ADDRESSES, []);
  if (leaderAddresses.length === 0) {
    throw new Error('LEADER_ADDRESSES must contain at least one address');
  }

  const followerPrivateKey = process.env.FOLLOWER_PRIVATE_KEY || '';
  if (!followerPrivateKey) {
    throw new Error('FOLLOWER_PRIVATE_KEY is required');
  }

  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }

  const telegramAllowedChatIds = parseEnvNumberArray(process.env.TELEGRAM_ALLOWED_CHAT_IDS, []);
  if (telegramAllowedChatIds.length === 0) {
    throw new Error('TELEGRAM_ALLOWED_CHAT_IDS must contain at least one chat ID');
  }

  const mode = (process.env.MODE || 'paper') as 'paper' | 'live';
  if (mode !== 'paper' && mode !== 'live') {
    throw new Error('MODE must be either "paper" or "live"');
  }

  const tifDefault = (process.env.TIF_DEFAULT || 'IOC') as 'IOC' | 'GTC';
  if (tifDefault !== 'IOC' && tifDefault !== 'GTC') {
    throw new Error('TIF_DEFAULT must be either "IOC" or "GTC"');
  }

  const copyModeDefault = (process.env.COPY_MODE || 'entry-only') as CopyMode;
  if (!['full', 'entry-only', 'signals-only'].includes(copyModeDefault)) {
    throw new Error('COPY_MODE must be one of: full, entry-only, signals-only');
  }

  return {
    leaderAddresses,
    followerPrivateKey,
    ratioDefault: parseFloat(process.env.RATIO_DEFAULT || '0.2'),
    notionalCapPerOrderUsd: parseFloat(process.env.NOTIONAL_CAP_PER_ORDER_USD || '200'),
    maxLeverage: parseFloat(process.env.MAX_LEVERAGE || '5'),
    maxTotalNotionalUsd: parseFloat(process.env.MAX_TOTAL_NOTIONAL_USD || '2000'),
    cooldownMsPerCoin: parseInt(process.env.COOLDOWN_MS_PER_COIN || '2000', 10),
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '1500', 10),
    copyModeDefault,
    telegramBotToken,
    telegramAllowedChatIds,
    minNotionalForNotification: parseFloat(process.env.MIN_NOTIONAL_FOR_NOTIFICATION || '5000'),
    mode,
    tifDefault,
    dryRunLogOnly: process.env.DRY_RUN_LOG_ONLY === 'true',
    stateFile: process.env.STATE_FILE || 'state.json',
  };
}
