// Note: primary key is id,chain,trovemanager

export type TroveDataEntry = {
  protocolId: number;
  blockNumber: number;
  troveManagerIndex: number;
  chain: string;
  troveData: TroveData[];
};

export type TroveDataByManager = {
  troveManagerIndex: number;
  troveData: TroveData[];
};

type TroveData = {
  troveId: string;
  debt: string;
  coll: string;
  stake: string;
  status: number;
  arrayIndex: number;
  lastDebtUpdateTime: string;
  lastInterestRateAdjTime: string;
  annualInterestRate: string;
  interestBatchManager: string;
  batchDebtShares: string;
};

export type EventDataEntry = {
  protocolId: number;
  blockNumber: number;
  troveManagerIndex: number;
  chain: string;
  txHash: string;
  logIndex: number;
  eventName: string;
  eventData: object; // FIX
};

export type EventData = {
  troveManagerIndex?: number;
  blockNumber: number;
  chain: string;
  txHash: string;
  logIndex: number;
  eventName: string;
  eventData: object; // FIX
};

export type CoreImmutablesEntry = {
  protocolId: number;
  blockNumber: number;
  chain: string;
  boldToken: string;
  boldTokenSymbol: string | null;
  collateralRegistry: string;
  interestRouter: string;
  coreCollateralImmutables: CoreColImmutables[];
};

export type CoreImmutables = {
  boldToken: string;
  boldTokenSymbol: string | null;
  collateralRegistry: string;
  interestRouter: string;
  coreCollateralImmutables: CoreColImmutables[];
};

export type CoreColImmutables = {
  troveManagerIndex: number;
  CCR: string;
  SCR: string;
  MCR: string;
  troveManager: string;
  collToken: string;
  collTokenSymbol: string | null;
  collTokenDecimals: string;
  activePool: string;
  defaultPool: string;
  stabilityPool: string;
  borrowerOperationsAddress: string;
  sortedTroves: string;
  troveNFT: string;
  priceFeed: string | null;
  isLST: boolean | null;
  LSTunderlying: string | null;
  collAlternativeChainAddresses: { [chain: string]: string[] } | null;
};

export type CorePoolDataEntry = {
  protocolId?: number;
  blockNumber?: number;
  chain: string;
  baseRate: string;
  getRedemptionRate: string;
  totalCollaterals: string;
  collateralPoolData: ColPoolData[];
};

export type CorePoolData = {
  baseRate: string;
  getRedemptionRate: string;
  totalCollaterals: string;
  collateralPoolData: ColPoolData[];
};

export type ColPoolData = {
  troveManagerIndex: number;
  getEntireSystemColl: string;
  getEntireSystemDebt: string;
  getTroveIdsCount: string;
  aggWeightedRecordedDebtSum: string;
  aggRecordedDebt: string;
  calcPendingAggInterest: string;
  calcPendingSPYield: string;
  lastAggUpdateTime: string;
  // stability pool:
  getCollBalance: string;
  getTotalBoldDeposits: string;
  getYieldGainsOwed: string;
  getYieldGainsPending: string;
};

export type RecordedBlocksEntryWithChain = {
  protocolId: number;
  chain: string;
  startBlock: number;
  endBlock: number;
};

export type CollateralPricesAndRatesEntry = {
  protocolId?: number;
  blockNumber?: number;
  chain: string;
  troveManagerIndex: number;
  colUSDPriceFeed: string | null;
  colUSDOracle: string | null;
  LSTUnderlyingCanonicalRate: string | null;
  LSTUnderlyingMarketRate: string | null;
  UnderlyingUSDOracle: string | null;
  deviation: string | null;
  redemptionRelatedOracles: {
    [key: `redemptionRelatedOracle${number}`]: string;
  };
};

export type CollateralPricesAndRates = {
  troveManagerIndex: number;
  colUSDPriceFeed: string | null;
  colUSDOracle: string | null;
  LSTUnderlyingCanonicalRate: string | null;
  LSTUnderlyingMarketRate: string | null;
  underlyingUSDOracle: string | null;
  deviation: string | null;
  [key: `redemptionRelatedOracle${number}`]: string;
};
