type CollateralConfig = {
  LSTunderlying: string | null;
  deviationThreshold: string | null;
  oracleType: "chainlink" | "custom" | null;
};

type ProtocolCollateralConfig = {
  [colRegistryAddressDashChain: string]: {
    [troveManagerIndex: number]: CollateralConfig;
  };
};

export const collateralConfigs: ProtocolCollateralConfig = {
  "0xd99dE73b95236F69A559117ECD6F519Af780F3f7-ethereum": {
    1: {
      LSTunderlying: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      deviationThreshold: "10000000000000000",
      oracleType: "chainlink",
    },
    2: {
      LSTunderlying: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      deviationThreshold: "20000000000000000",
      oracleType: "chainlink",
    },
  },
};

export function getCollateralConfig(colRegistryAddressDashChain: string, troveManagerIndex: number): CollateralConfig {
  const defaultConfig: CollateralConfig = {
    LSTunderlying: null,
    deviationThreshold: null,
    oracleType: null,
  };

  return collateralConfigs[colRegistryAddressDashChain]?.[troveManagerIndex] ?? defaultConfig;
}
