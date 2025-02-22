export const PRICES_API = "https://coins.llama.fi/prices";

export const defaultConfidenceThreshold = 0.5; // for querying defillama prices

export const maxBlocksToQueryByChain = {
  default: 400,
  ethereum: 500,
  polygon: 2000,
  base: 2000,
  arbitrum: 25000,
  avalanche: 3000,
  avax: 3000,
  bsc: 2000,
  optimism: 12000,
  gnosis: 400,
} as { [chain: string]: number };
