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
  txHash: string;
  logIndex: number;
  chain: string;
  eventName: string;
  eventData: any; // FIX
};

export type EventData = {
  getTroveManagerIndex?: number;
  txHash: string;
  chain: string;
  eventName: string;
  eventData: any; // FIX
};

export type CoreImmutablesEntry = {
  protocolId: number;
  blockNumber: number;
  chain: string;
  immutableData: CoreImmutables;
};

export type CoreImmutables = {
  boldToken: string;
  collateralRegistry: string;
  interestRouter: string;
  coreCollateralImmutables: CoreColImmutables;
};

export type CoreColImmutables = {
  [getTroveManagerIndex: number]: {
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
    priceFeed: string;
  };
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

export type RecordedBlocks = {
  [adapterDbNameChain: string]: {
    startBlock: number;
    endBlock: number;
  };
};
