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
  ownerAddress?: string;
  troveId: string;
  debt: string;
  entireDebt: string;
  coll: string;
  stake: string;
  status: number;
  arrayIndex: number;
  lastDebtUpdateTime: string;
  lastInterestRateAdjTime: string;
  annualInterestRate: string;
  accruedInterest: string;
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
  operation: number | null;
  eventData: object; // FIX
};

export type EventData = {
  troveManagerIndex?: number;
  blockNumber: number;
  chain: string;
  txHash: string;
  logIndex: number;
  eventName: string;
  operation: number | null;
  eventData: object; // FIX
};

export type CoreImmutablesEntry = {
  protocolId: number;
  blockNumber: number;
  chain: string;
  boldToken: string;
  boldTokenSymbol: string | null;
  nativeToken: string | null;
  collateralRegistry: string;
  interestRouter: string;
  coreCollateralImmutables: CoreColImmutables[];
};

export type CoreImmutables = {
  boldToken: string;
  boldTokenSymbol: string | null;
  nativeToken: string | null;
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
  collAlternativeChainAddresses: string[] | null;
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
  getCollBalanceActivePool: string;
  getCollBalanceDefaultPool: string;
  getCollBalanceStabilityPool: string;
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
  colUSDPriceFeed: number | null;
  colUSDOracle: number | null;
  LSTUnderlyingCanonicalRate: number | null;
  LSTUnderlyingMarketRate: number | null;
  underlyingUSDOracle: number | null;
  deviation: number | null;
  redemptionRelatedOracles: {
    [key: `redemptionRelatedOracle${number}`]: number;
  };
};

export type CollateralPricesAndRates = {
  troveManagerIndex: number;
  colUSDPriceFeed: number | null;
  colUSDOracle: number | null;
  LSTUnderlyingCanonicalRate: number | null;
  LSTUnderlyingMarketRate: number | null;
  underlyingUSDOracle: number | null;
  deviation: number | null;
  [key: `redemptionRelatedOracle${number}`]: number;
};

export type HourlyTroveDataSummaryEntry = {
  protocolId?: number;
  chain: string;
  troveManagerIndex: number;
  date: Date;
  hour: number;
  targetTimestamp: number;
  avgInterestRate: string | null;
  colRatio: string | null;
  statusCounts: {
    [statusCode: string]: number;
  };
  totalTroves: number;
};

export type TroveOwnerEntry = {
  protocolId?: number;
  blockNumber?: number;
  troveManagerIndex: number;
  chain: string;
  troveOwners: TroveOwner[];
};

export type TroveOwner = {
  troveId: string;
  ownerAddress: string;
};
