export interface ImmutablesAbi {
  boldToken: string;
  tokenSymbol: string;
  fetchTroveManagers: {
    lengthAbi: string;
    itemAbi: string;
  };
  activePool: string;
  defaultPoolAddress: string;
  CCR: string;
  SCR: string;
  MCR: string;
  interestRouter: string;
  collToken: string;
  stabilityPool: string;
  borrowerOperationsAddress: string;
  sortedTroves: string;
  troveNFT: string;
  priceFeed: string;
  decimals: string;
  symbol: string;
}

export interface CorePoolAbi {
  baseRate: string;
  getRedemptionRate: string;
  totalCollaterals: string;
  getEntireSystemColl: string;
  getEntireSystemDebt: string;
  getTroveIdsCount: string;
  aggWeightedRecordedDebtSum: string;
  aggRecordedDebt: string;
  calcPendingAggInterest: string;
  calcPendingSPYield: string;
  lastAggUpdateTime: string;
  getCollBalance: string;
  getTotalBoldDeposits: string;
  getYieldGainsOwed: string;
  getYieldGainsPending: string;
}
