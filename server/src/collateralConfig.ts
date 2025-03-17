export type CollateralConfig = {
  isLST?: boolean;
  rateProviderAddress?: string;
  LSTunderlying?: string;
  priceFeedType?: "mainnet" | "composite" | "custom";
  priceFeedLastGoodPriceDecimals?: number;
  LSTUnderlyingCanonicalRateAbi?: string;
  deviationFormula?: string;
  deviationThreshold?: string;
  colUSDOracle?: OracleAddress;
  underlyingUSDOracle?: OracleAddress;
  LSTUnderlyingMarketRateOracle?: OracleAddress;
  redemptionRelatedOracles?: {
    [key: number]: OracleAddress;
  };
  creationCodeMapping?: {
    [key in OraclePurpose]?: OracleCreationCode;
  };
  collAlternativeChainAddresses?: string[];
};

export type OracleAddress = { address: string; oracleType: OracleType };

type OracleType = "chainlink" | "custom";

export type OraclePurpose = "colUSDOracle" | "underlyingUSDOracle" | "LSTUnderlyingMarketRateOracle";

export type OracleCreationCode = [0 | 1 | 2 | 3, OracleType];

type ProtocolCollateralConfig = {
  [protocolIdChain: string]: {
    [troveManagerIndex: number]: CollateralConfig;
  };
};

type ProtocolConfig = {
  [protocolIdChain: string]: {
    nativeToken: string | null;
  };
};

export const protocolConfigs: ProtocolConfig = {
  "1-ethereum": {
    nativeToken: "0x6dea81c8171d0ba574754ef6f8b412f2ed88c54d",
  },
};

export const collateralConfigs: ProtocolCollateralConfig = {
  "1-ethereum": {
    0: {
      priceFeedType: "mainnet",
      priceFeedLastGoodPriceDecimals: 18,
      colUSDOracle: { address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", oracleType: "chainlink" },
      // FIX: following is for testing, remove
      creationCodeMapping: {
        colUSDOracle: [1, "chainlink"],
      },
    },
    1: {
      priceFeedType: "composite",
      isLST: true,
      priceFeedLastGoodPriceDecimals: 18,
      LSTunderlying: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      deviationFormula: "underlyingUSDOracle/redemptionRelatedOracle0-1",
      deviationThreshold: "10000000000000000",
      LSTUnderlyingCanonicalRateAbi: "uint256:stEthPerToken",
      // FIX: following is for testing, remove
      creationCodeMapping: {
        underlyingUSDOracle: [2, "chainlink"],
      },
      redemptionRelatedOracles: {
        0: { address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", oracleType: "chainlink" },
      },
    },
    2: {
      isLST: true,
      priceFeedType: "composite",
      priceFeedLastGoodPriceDecimals: 18,
      LSTunderlying: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      deviationFormula: "LSTUnderlyingCanonicalRate-LSTUnderlyingMarketRate",
      deviationThreshold: "20000000000000000",
      LSTUnderlyingCanonicalRateAbi: "uint256:getExchangeRate",
      collAlternativeChainAddresses: ["bsc:0x2170Ed0880ac9A755fd29B2688956BD959F933F8"],
      underlyingUSDOracle: { address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", oracleType: "chainlink" },
      LSTUnderlyingMarketRateOracle: { address: "0x536218f9E9Eb48863970252233c8F271f554C2d0", oracleType: "chainlink" },
    },
  },
};

export function getCollateralConfig(protocolId: number, chain: string, troveManagerIndex: number): CollateralConfig {
  const defaultConfig: CollateralConfig = {};

  return collateralConfigs[`${protocolId}-${chain}`]?.[troveManagerIndex] ?? defaultConfig;
}

export function getProtocolConfig(protocolId: number, chain: string) {
  const defaultConfig = { nativeToken: null };

  return protocolConfigs[`${protocolId}-${chain}`] ?? defaultConfig;
}
