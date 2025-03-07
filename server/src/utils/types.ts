// Note: primary key is id,chain,trovemanager

export type TroveDataEntry = {
  protocolId: number;
  blockNumber: number;
  getTroveManagerIndex: number;
  chain: string;
  troveData: TroveData[];
};

export type TroveDataByManager = {
  getTroveManagerIndex: number;
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
  getTroveManagerIndex: number;
  chain: string;
  txHash: string;
  logIndex: number;
  eventName: string;
  eventData: object; // FIX
};

export type EventData = {
  getTroveManagerIndex?: number;
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
  collateralRegistry: string;
  interestRouter: string;
  coreCollateralImmutables: CoreColImmutables[];
};

export type CoreImmutables = {
  boldToken: string;
  collateralRegistry: string;
  interestRouter: string;
  coreCollateralImmutables: CoreColImmutables[];
};

export type CoreColImmutables = {
  getTroveManagerIndex: number;
  CCR: string;
  SCR: string;
  MCR: string;
  troveManager: string;
  collToken: string;
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
  getTroveManagerIndex: number;
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
  blockNumber?: number;
  chain: string;
  collToken: string;
  colUSDPriceFeed: string;
  colUSDOracle: string;
  LSTUnderlyingCanonicalRate: string;
  LSTUnderlyingMarketRate: string;
  UnderlyingUSDOracle: string;
  deviation: string;
  colUSDOnchainEstimatedPrice: string;
};

export type CollateralPricesAndRates = {
  collToken: string;
  colUSDPriceFeed: string;
  colUSDOracle: string;
  LSTUnderlyingCanonicalRate: string;
  LSTUnderlyingMarketRate: string;
  underlyingUSDOracle: string;
  deviation: string;
  colUSDOnchainEstimatedPrice: string;
};
