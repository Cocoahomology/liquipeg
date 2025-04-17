export const PROTOCOL_CONFIG_API =
  "https://fqpzg5xw1g.execute-api.ap-east-1.amazonaws.com/prod/getprotocols";
export const EVENTS_API =
  "https://fqpzg5xw1g.execute-api.ap-east-1.amazonaws.com/prod/getevents";
export const LATEST_TROVE_DATA_API =
  "https://fqpzg5xw1g.execute-api.ap-east-1.amazonaws.com/prod/getlatesttrovedata";
export const POOL_DATA_CHART_API =
  "https://fqpzg5xw1g.execute-api.ap-east-1.amazonaws.com/prod/getpooldatachart";
export const PRICES_CHART_API =
  "https://fqpzg5xw1g.execute-api.ap-east-1.amazonaws.com/prod/getpriceschart";
export const TROVE_DATA_SUMMARY_CHART =
  "https://fqpzg5xw1g.execute-api.ap-east-1.amazonaws.com/prod/gettrovedatasummarychart";

export const topStablesByChain = {
  ethereum: [
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
  ],
  arbitrum: [
    "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
    "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
  ],
  berachain: [],
  scroll: [],
};
