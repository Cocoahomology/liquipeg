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
  troveId: BigInt | string;
  debt: BigInt | string;
  coll: BigInt | string;
  stake: BigInt | string;
  status: number;
  arrayIndex: number;
  lastDebtUpdateTime: BigInt | string;
  lastInterestRateAdjTime: BigInt | string;
  annualInterestRate: BigInt | string;
  interestBatchManager: string;
  batchDebtShares: BigInt | string;
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
    CCR: BigInt | string;
    SCR: BigInt | string;
    MCR: BigInt | string;
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
  baseRate: BigInt | string;
  getRedemptionRate: BigInt | string;
  totalCollaterals: BigInt | string;
  collateralPoolData: {
    [getTroveManagerIndex: number]: ColPoolData;
  };
};

export type CorePoolData = {
  baseRate: BigInt | string;
  getRedemptionRate: BigInt | string;
  totalCollaterals: BigInt | string;
  collateralPoolData: {
    [getTroveManagerIndex: number]: ColPoolData;
  };
};

export type ColPoolData = {
  getTroveManagerIndex: number;
  getEntireSystemColl: BigInt | string;
  getEntireSystemDebt: BigInt | string;
  getTroveIdsCount: BigInt | string;
  aggWeightedRecordedDebtSum: BigInt | string;
  aggRecordedDebt: BigInt | string;
  calcPendingAggInterest: BigInt | string;
  calcPendingSPYield: BigInt | string;
  lastAggUpdateTime: BigInt | string;
  // stability pool:
  getCollBalance: BigInt | string;
  getTotalBoldDeposits: BigInt | string;
  getYieldGainsOwed: BigInt | string;
  getYieldGainsPending: BigInt | string;
};

export type RecordedBlocks = {
  [adapterDbNameChain: string]: {
    startBlock: number;
    endBlock: number;
  };
};
