export const PRICES_API = "https://coins.llama.fi/prices";

export const defaultConfidenceThreshold = 0.5; // for querying defillama prices

export const defaultStartTimestamp = 1740758400; // for handlers FIX

// Should be equal to 90 minutes worth of blocks; affects how timestamps are stored in blockTimestamps
export const maxBlocksToQueryByChain = {
  default: 400,
  ethereum: 450,
  polygon: 2700,
  base: 2700,
  arbitrum: 18000,
  avalanche: 2700,
  avax: 2700,
  bsc: 1800,
  optimism: 2700,
  gnosis: 1080,
  hyperliquid: 900,
} as { [chain: string]: number };
