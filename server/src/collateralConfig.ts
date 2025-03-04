type CollateralConfig = {
  isLST?: boolean;
  rateProviderAddress?: string;
  LSTunderlying?: string;
  priceFeedType?: "mainnet" | "composite" | "custom";
  oracleType?: "chainlink" | "custom";
  LSTUnderlyingCanonicalRateAbi?: string;
  deviationThresholdFormula?: string;
  deviationThreshold?: string;
  colUSDOracle?: string;
  underlyingUSDOracle?: string;
  LSTUnderlyingMarketRateOracle?: string;
  creationCodeMapping?: {
    [key in OraclePurpose]?: 0 | 1 | 2 | 3;
  };
  collAlternativeChainAddresses?: {
    [chain: string]: string[];
  };
};

type OraclePurpose = "colUSDOracle" | "underlyingUSDOracle" | "LSTUnderlyingMarketRateOracle";

type ProtocolCollateralConfig = {
  [protocolIdChain: string]: {
    [troveManagerIndex: number]: CollateralConfig;
  };
};

export const collateralConfigs: ProtocolCollateralConfig = {
  "1-ethereum": {
    0: {
      colUSDOracle: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
      // FIX: following is for testing, remove
      creationCodeMapping: {
        colUSDOracle: 1,
      },
    },
    1: {
      LSTunderlying: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      deviationThreshold: "10000000000000000",
      oracleType: "chainlink",
      LSTUnderlyingCanonicalRateAbi: "uint256:stEthPerToken",
      // FIX: following is for testing, remove
      creationCodeMapping: {
        underlyingUSDOracle: 2,
      },
    },
    2: {
      LSTunderlying: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      deviationThreshold: "20000000000000000",
      oracleType: "chainlink",
      LSTUnderlyingCanonicalRateAbi: "uint256:getExchangeRate",
      collAlternativeChainAddresses: {
        bsc: ["0x2170Ed0880ac9A755fd29B2688956BD959F933F8"],
      },
      underlyingUSDOracle: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
      // FIX: following is for testing, remove
      creationCodeMapping: {
        LSTUnderlyingMarketRateOracle: 2,
      },
    },
  },
};

export function getCollateralConfig(protocolId: number, chain: string, troveManagerIndex: number): CollateralConfig {
  const defaultConfig: CollateralConfig = {};

  return collateralConfigs[`${protocolId}-${chain}`]?.[troveManagerIndex] ?? defaultConfig;
}
