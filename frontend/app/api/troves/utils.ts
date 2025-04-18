import { getPercentChange, formatProtocolMetricNumber, slug } from "~/utils";

// Define types for the protocol data structure
interface TroveManager {
  troveManagerIndex: number;
  latestPoolData: PoolDataPoint;
  latestPriceData: PriceDataPoint;
  colImmutables: ColImmutables;
  troveData: TroveData[] | null;
  eventData: any;
  // Metrics that will be calculated
  currentDebtBold?: string | null;
  currentCol?: string | null;
  currentColUSD?: string | null;
  currentSpBold?: string | null;
  currentSpColUsd?: string | null;
  colRatio?: string | null;
  currentColUSDOracle?: string | number | null;
  currentColUSDPriceFeed?: string | number | null;
  prevDayDebtBold?: string | null;
  prevDayColUSD?: string | null;
  prevDaySpBold?: string | null;
  prevDaySpColUsd?: string | null;
  prevDayColRatio?: string | null;
  prev7DayDebtBold?: string | null;
  prev7DayColUSD?: string | null;
  prev7DaySpBold?: string | null;
  prev7DaySpColUsd?: string | null;
  prev7DayColRatio?: string | null;
  prevDayColUSDOracle?: string | number | null;
  prev7DayColUSDOracle?: string | number | null;
  tvlChange1d?: number | null;
  tvlChange7d?: number | null;
  collateralRatioChange1d?: number | null;
  collateralRatioChange7d?: number | null;
  colUSDOracleChange1d?: number | null;
  colUSDOracleChange7d?: number | null;
  avgIR?: string | number | null;
  minIR?: string | number | null;
  maxLiqPrice?: string | number | null;
  prev7DayRedemptionTotal?: string | null;
}

interface TroveManagersMap {
  [troveManagerIndex: number]: TroveManager;
}

interface ChainData {
  troveManagers: TroveManagersMap;
}

interface Protocol {
  protocolInfo: any;
  chainData: {
    [chainName: string]: ChainData;
  };
}

interface PoolDataPoint {
  date: string;
  timestamp: string;
  getEntireSystemDebt?: string;
  getEntireSystemColl?: string;
  getTotalBoldDeposits?: string;
  getYieldGainsOwed?: string;
  getYieldGainsPending?: string;
  getCollBalanceStabilityPool?: string;
  [key: string]: any;
}

interface PriceDataPoint {
  date: string;
  timestamp: string;
  colUSDOracle?: string | number;
  colUSDPriceFeed?: string | number;
  [key: string]: any;
}

interface TroveData {
  troveManagerIndex: number;
  troveData: any[];
}

interface ColImmutables {
  collTokenDecimals?: string;
  MCR?: string;
  [key: string]: any;
}

export function formatTroveData(protocolData: Protocol): Protocol {
  const protocol = protocolData;

  // Collect all troves across all chains and trove managers to calculate debtInFront properly
  const allTrovesByProtocol: Record<
    string,
    Array<{ trove: any; chainName: string; troveManagerIndex: number }>
  > = {};

  // First pass: Collect all troves and organize by chain/manager
  Object.keys(protocol.chainData).forEach((chainName) => {
    const chainData = protocol.chainData[chainName];

    chainData.troveManagers = chainData.troveManagers || {};

    // Convert array to object if it's still an array
    if (Array.isArray(chainData.troveManagers)) {
      const troveManagersObj: TroveManagersMap = {};
      chainData.troveManagers.forEach((tm) => {
        troveManagersObj[tm.troveManagerIndex] = tm;
      });
      chainData.troveManagers = troveManagersObj;
    }

    // Collect troves from each trove manager
    Object.values(chainData.troveManagers).forEach((troveManager) => {
      const protocolId = protocol.protocolInfo?.protocolId;

      if (!protocolId) return;

      if (!allTrovesByProtocol[protocolId]) {
        allTrovesByProtocol[protocolId] = [];
      }

      // Add troves to the collection with metadata
      if (troveManager.troveData && troveManager.troveData.length > 0) {
        troveManager.troveData.forEach((trove) => {
          // Only include troves with valid data
          if (trove.entire_debt && parseFloat(trove.entire_debt) > 0) {
            allTrovesByProtocol[protocolId].push({
              trove,
              chainName,
              troveManagerIndex: troveManager.troveManagerIndex,
            });
          }
        });
      }
    });
  });

  // Process each chain in the protocol
  Object.keys(protocol.chainData).forEach((chainName) => {
    const chainData = protocol.chainData[chainName];

    chainData.troveManagers = chainData.troveManagers || {};

    // Convert array to object if it's still an array
    if (Array.isArray(chainData.troveManagers)) {
      const troveManagersObj: TroveManagersMap = {};
      chainData.troveManagers.forEach((tm) => {
        troveManagersObj[tm.troveManagerIndex] = tm;
      });
      chainData.troveManagers = troveManagersObj;
    }

    // Process each trove manager using object iteration
    Object.values(chainData.troveManagers).forEach((troveManager) => {
      const {
        latestPoolData,
        latestPricesAndRates: latestPriceData,
        colImmutables,
        troveData,
      } = troveManager;

      const { MCR } = colImmutables;
      if (MCR) {
        troveManager.mcr = MCR;
      }

      troveManager.troveCount = troveData?.length || 0;

      // Get decimal values from colImmutables
      const collTokenDecimals = parseInt(
        colImmutables.collTokenDecimals || "18",
        10
      );
      const decimalsMultiplier = Math.pow(10, collTokenDecimals);

      troveManager.collTokenDecimals = collTokenDecimals;

      if (latestPoolData && latestPriceData) {
        // Calculate current metrics - only process the essential ones
        calculateCurrentMetrics(
          troveManager,
          latestPoolData,
          latestPriceData,
          decimalsMultiplier
        );

        // Calculate colRatio for each trove in troveData
        if (
          troveData &&
          troveData.length > 0 &&
          latestPriceData.colUSDPriceFeed
        ) {
          // Process each trove to calculate colRatio and debtInFront
          troveData.forEach((trove) => {
            if (
              trove.coll &&
              trove.entire_debt &&
              parseFloat(trove.entire_debt) > 0
            ) {
              const collValue = parseFloat(trove.coll);
              const debtValue = parseFloat(trove.entire_debt);
              const priceValue = parseFloat(
                String(latestPriceData.colUSDPriceFeed)
              );

              // Calculate the collateral ratio
              trove.colRatio =
                (collValue * priceValue * 1e18) /
                (debtValue * decimalsMultiplier);

              // Calculate debtInFront based on the interest rate across all trove managers
              const protocolId = protocol.protocolInfo?.protocolId;
              if (protocolId && allTrovesByProtocol[protocolId]) {
                const troveIR =
                  trove.annualInterestRate !== undefined
                    ? parseFloat(trove.annualInterestRate)
                    : Infinity;

                // Sum debt of all troves across all trove managers that have annualInterestRate < current trove's rate
                const debtInFront = allTrovesByProtocol[protocolId].reduce(
                  (sum, { trove: otherTrove }) => {
                    const otherIR =
                      otherTrove.annualInterestRate !== undefined
                        ? parseFloat(otherTrove.annualInterestRate)
                        : Infinity;

                    if (otherIR < troveIR) {
                      return sum + parseFloat(otherTrove.entire_debt || "0");
                    }
                    return sum;
                  },
                  0
                );

                trove.debtInFront = debtInFront;
              } else {
                trove.debtInFront = 0;
              }
            } else {
              trove.colRatio = null;
              trove.debtInFront = 0;
            }
          });
        }
      } else {
        console.warn(
          `Missing data for trove manager ${troveManager.troveManagerIndex}:`,
          latestPoolData ? "Price data missing" : "Pool data missing"
        );
      }
    });
  });

  return protocolData;
}

// Helper function to calculate current metrics for a trove manager
function calculateCurrentMetrics(
  troveManager: TroveManager,
  latestPoolData: PoolDataPoint,
  latestPriceData: PriceDataPoint,
  decimalsMultiplier: number
): void {
  // Initialize metrics as null
  troveManager.currentDebtBold = null;
  troveManager.currentCol = null;
  troveManager.currentColUSD = null;
  troveManager.currentSpBold = null;
  troveManager.currentSpColUsd = null;
  troveManager.colRatio = null;
  troveManager.currentColUSDOracle = latestPriceData.colUSDOracle || null;
  troveManager.currentColUSDPriceFeed = latestPriceData.colUSDPriceFeed || null;

  // Calculate debt in BOLD
  if (latestPoolData.getEntireSystemDebt) {
    const debtValue = parseFloat(latestPoolData.getEntireSystemDebt) / 1e18;
    troveManager.currentDebtBold = formatProtocolMetricNumber(debtValue);
  }

  // Calculate collateral in USD
  if (latestPoolData.getEntireSystemColl && latestPriceData.colUSDPriceFeed) {
    const currentColUSD =
      (parseFloat(latestPoolData.getEntireSystemColl) *
        parseFloat(String(latestPriceData.colUSDPriceFeed))) /
      decimalsMultiplier;
    troveManager.currentColUSD = formatProtocolMetricNumber(currentColUSD);
  }

  // Calculate collateral
  if (latestPoolData.getEntireSystemColl) {
    const currentCol =
      parseFloat(latestPoolData.getEntireSystemColl) / decimalsMultiplier;
    troveManager.currentCol = formatProtocolMetricNumber(currentCol);
  }

  // Calculate stability pool BOLD
  if (
    latestPoolData.getTotalBoldDeposits ||
    latestPoolData.getYieldGainsOwed ||
    latestPoolData.getYieldGainsPending
  ) {
    const spBoldValue =
      (parseFloat(latestPoolData.getTotalBoldDeposits || "0") +
        parseFloat(latestPoolData.getYieldGainsOwed || "0") +
        parseFloat(latestPoolData.getYieldGainsPending || "0")) /
      1e18;
    troveManager.currentSpBold = formatProtocolMetricNumber(spBoldValue);
  }

  // Calculate stability pool collateral in USD
  if (
    latestPoolData.getCollBalanceStabilityPool &&
    latestPriceData.colUSDPriceFeed
  ) {
    const spColUsdValue =
      (parseFloat(latestPoolData.getCollBalanceStabilityPool) *
        parseFloat(String(latestPriceData.colUSDPriceFeed))) /
      decimalsMultiplier;
    troveManager.currentSpColUsd = formatProtocolMetricNumber(spColUsdValue);
  }

  // Calculate collateral ratio
  if (
    troveManager.currentColUSD &&
    troveManager.currentDebtBold &&
    troveManager.currentDebtBold !== "0"
  ) {
    const colRatioValue =
      parseFloat(troveManager.currentColUSD) /
      parseFloat(troveManager.currentDebtBold);
    troveManager.colRatio = formatProtocolMetricNumber(colRatioValue);
  }
}
