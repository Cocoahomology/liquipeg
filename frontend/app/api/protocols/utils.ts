import { getPercentChange, formatProtocolMetricNumber, slug } from "~/utils";

// Define types for the protocol data structure
interface TroveManager {
  troveManagerIndex: number;
  poolDataPoints: PoolDataPoint[];
  priceDataPoints: PriceDataPoint[];
  colImmutables: ColImmutables;
  troveData: TroveData[] | null;
  eventData: any;
  // Metrics that will be calculated
  currentDebtBold?: string | null;
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
  // Chain-level metrics
  currentProtocolTvl?: string | null;
  currentProtocolColRatio?: string | null;
  currentProtocolDebtBold?: string | null;
  currentProtocolSpTvl?: string | null;
  prevDayProtocolTvl?: string | null;
  prevDayProtocolColRatio?: string | null;
  prevDayProtocolDebtBold?: string | null;
  prevDayProtocolSpTvl?: string | null;
  prev7DayProtocolTvl?: string | null;
  prev7DayProtocolColRatio?: string | null;
  prev7DayProtocolDebtBold?: string | null;
  prev7DayProtocolSpTvl?: string | null;
  prev7DayProtocolRedemptionTotal?: string | null; // New field for protocol level redemption total
  tvlChange1d?: number | null;
  tvlChange7d?: number | null;
  colRatioChange1d?: number | null;
  colRatioChange7d?: number | null;
  debtBoldChange1d?: number | null;
  debtBoldChange7d?: number | null;
  spTvlChange1d?: number | null;
  spTvlChange7d?: number | null;
}

interface Protocol {
  protocolInfo: any;
  chainData: {
    [chainName: string]: ChainData;
  };
}

interface ProtocolDataByName {
  [protocolId: string]: Protocol;
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

interface ChainMetrics {
  current: {
    colUSD: number;
    debtBold: number;
    spBold: number;
    spColUsd: number;
  };
  prevDay: {
    colUSD: number;
    debtBold: number;
    spBold: number;
    spColUsd: number;
  };
  prev7Day: {
    colUSD: number;
    debtBold: number;
    spBold: number;
    spColUsd: number;
  };
}

export function formatProtocolData(
  protocolDataByName: ProtocolDataByName
): ProtocolDataByName {
  // Get current timestamp to calculate 7-day window
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const sevenDaysInSeconds = 7 * 24 * 60 * 60;
  const cutoffTimestamp = currentTimestamp - sevenDaysInSeconds;

  // Process each protocol
  Object.keys(protocolDataByName).forEach((protocolId) => {
    const protocol = protocolDataByName[protocolId];

    // Process each chain in the protocol
    Object.keys(protocol.chainData).forEach((chainName) => {
      const chainData = protocol.chainData[chainName];

      // Initialize chain-level metrics
      const chainMetrics: ChainMetrics = {
        current: { colUSD: 0, debtBold: 0, spBold: 0, spColUsd: 0 },
        prevDay: { colUSD: 0, debtBold: 0, spBold: 0, spColUsd: 0 },
        prev7Day: { colUSD: 0, debtBold: 0, spBold: 0, spColUsd: 0 },
      };

      // Process each trove manager - changed from array to object processing
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
          poolDataPoints,
          priceDataPoints,
          colImmutables,
          troveData,
          eventData,
        } = troveManager;

        // Initialize prev7DayRedemptionTotal
        troveManager.prev7DayRedemptionTotal = "0";

        // Calculate prev7DayRedemptionTotal from event data
        // FIXED: eventData is an array of objects, each with its own events array and timestamp
        if (Array.isArray(eventData)) {
          let totalRedemption = 0;

          // Process each event entry in the eventData array
          eventData.forEach((entry) => {
            // Check if the entry timestamp is within the last 7 days
            const entryTimestamp = parseInt(entry.timestamp, 10);
            if (
              entryTimestamp >= cutoffTimestamp &&
              Array.isArray(entry.events)
            ) {
              // Process each event in the entry's events array
              entry.events.forEach((event) => {
                // Check if this is a redemption operation (operation = 6)
                if (
                  event.operation === 6 &&
                  event.eventData?.debtChangeFromOperation
                ) {
                  // Check if debtChangeFromOperation is negative
                  const debtChange = parseFloat(
                    event.eventData.debtChangeFromOperation
                  );
                  if (debtChange < 0) {
                    // Add the absolute value of the debt change to the total
                    totalRedemption += Math.abs(debtChange);
                  }
                }
              });
            }
          });

          // Set the redemption total if we found any redemption events
          if (totalRedemption > 0) {
            // Use toFixed(0) to ensure the value is represented as a full number without exponential notation
            troveManager.prev7DayRedemptionTotal = totalRedemption.toFixed(0);
          }
        }

        // Skip if not enough data points
        if (
          !poolDataPoints?.length ||
          !priceDataPoints?.length ||
          poolDataPoints.length < 2 ||
          priceDataPoints.length < 2
        ) {
          return;
        }

        // Get decimal values from colImmutables
        const collTokenDecimals = parseInt(
          colImmutables.collTokenDecimals || "18",
          10
        );
        const decimalsMultiplier = Math.pow(10, collTokenDecimals);

        // Get latest data points
        const latestPoolData = poolDataPoints[poolDataPoints.length - 1];
        const latestPriceData = priceDataPoints[priceDataPoints.length - 1];

        if (!latestPoolData || !latestPriceData) return;

        // Calculate current metrics - only process the essential ones
        calculateCurrentMetrics(
          troveManager,
          latestPoolData,
          latestPriceData,
          decimalsMultiplier
        );

        // Calculate previous metrics using the helper function
        calculatePreviousMetricsForTrove(
          troveManager,
          poolDataPoints,
          priceDataPoints,
          decimalsMultiplier
        );

        // Process trove data for interest rates and liquidation prices
        processAdvancedTroveMetrics(troveManager, troveData, colImmutables);

        // Add to chain-level metric totals if available
        if (troveManager.currentColUSD)
          chainMetrics.current.colUSD += parseFloat(troveManager.currentColUSD);
        if (troveManager.currentDebtBold)
          chainMetrics.current.debtBold += parseFloat(
            troveManager.currentDebtBold
          );
        if (troveManager.currentSpBold)
          chainMetrics.current.spBold += parseFloat(troveManager.currentSpBold);
        if (troveManager.currentSpColUsd)
          chainMetrics.current.spColUsd += parseFloat(
            troveManager.currentSpColUsd
          );

        if (troveManager.prevDayColUSD)
          chainMetrics.prevDay.colUSD += parseFloat(troveManager.prevDayColUSD);
        if (troveManager.prevDayDebtBold)
          chainMetrics.prevDay.debtBold += parseFloat(
            troveManager.prevDayDebtBold
          );
        if (troveManager.prevDaySpBold)
          chainMetrics.prevDay.spBold += parseFloat(troveManager.prevDaySpBold);
        if (troveManager.prevDaySpColUsd)
          chainMetrics.prevDay.spColUsd += parseFloat(
            troveManager.prevDaySpColUsd
          );

        if (troveManager.prev7DayColUSD)
          chainMetrics.prev7Day.colUSD += parseFloat(
            troveManager.prev7DayColUSD
          );
        if (troveManager.prev7DayDebtBold)
          chainMetrics.prev7Day.debtBold += parseFloat(
            troveManager.prev7DayDebtBold
          );
        if (troveManager.prev7DaySpBold)
          chainMetrics.prev7Day.spBold += parseFloat(
            troveManager.prev7DaySpBold
          );
        if (troveManager.prev7DaySpColUsd)
          chainMetrics.prev7Day.spColUsd += parseFloat(
            troveManager.prev7DaySpColUsd
          );
      });

      // Calculate and set chain-level metrics
      setChainLevelMetrics(chainData, chainMetrics);
    });
  });

  return protocolDataByName;
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

// Helper function to calculate previous metrics for a trove manager
function calculatePreviousMetricsForTrove(
  troveManager: TroveManager,
  poolDataPoints: PoolDataPoint[],
  priceDataPoints: PriceDataPoint[],
  decimalsMultiplier: number
): void {
  // Initialize previous metrics as null
  troveManager.prevDayDebtBold = null;
  troveManager.prevDayColUSD = null;
  troveManager.prevDaySpBold = null;
  troveManager.prevDaySpColUsd = null;
  troveManager.prevDayColRatio = null;
  troveManager.prev7DayDebtBold = null;
  troveManager.prev7DayColUSD = null;
  troveManager.prev7DaySpBold = null;
  troveManager.prev7DaySpColUsd = null;
  troveManager.prev7DayColRatio = null;
  troveManager.prevDayColUSDOracle = null;
  troveManager.prev7DayColUSDOracle = null;

  // Calculate previous day metrics
  const prevDayMetrics = calculatePreviousMetrics(
    poolDataPoints,
    priceDataPoints,
    1, // 1 day ago
    decimalsMultiplier
  );

  if (prevDayMetrics) {
    troveManager.prevDayDebtBold = prevDayMetrics.debtBold;
    troveManager.prevDayColUSD = prevDayMetrics.colUSD;
    troveManager.prevDaySpBold = prevDayMetrics.spBold;
    troveManager.prevDaySpColUsd = prevDayMetrics.spColUsd;
    troveManager.prevDayColRatio = prevDayMetrics.colRatio;
  }

  // Calculate 7-day previous metrics
  const prev7DayMetrics = calculatePreviousMetrics(
    poolDataPoints,
    priceDataPoints,
    7, // 7 days ago
    decimalsMultiplier
  );

  if (prev7DayMetrics) {
    troveManager.prev7DayDebtBold = prev7DayMetrics.debtBold;
    troveManager.prev7DayColUSD = prev7DayMetrics.colUSD;
    troveManager.prev7DaySpBold = prev7DayMetrics.spBold;
    troveManager.prev7DaySpColUsd = prev7DayMetrics.spColUsd;
    troveManager.prev7DayColRatio = prev7DayMetrics.colRatio;
  }

  // Extract oracle prices from priceDataPoints with timestamp validation
  if (priceDataPoints && priceDataPoints.length > 1) {
    // For 1-day previous oracle price
    const prevDayPriceData = priceDataPoints[priceDataPoints.length - 2];
    if (isValidPreviousTimestamp(priceDataPoints, prevDayPriceData, 1)) {
      troveManager.prevDayColUSDOracle = prevDayPriceData.colUSDOracle;
    }

    // For 7-day previous oracle price
    if (priceDataPoints.length >= 8) {
      const prev7DayPriceData = priceDataPoints[priceDataPoints.length - 8];
      if (isValidPreviousTimestamp(priceDataPoints, prev7DayPriceData, 7)) {
        troveManager.prev7DayColUSDOracle = prev7DayPriceData.colUSDOracle;
      }
    }
  }

  // Calculate percentage changes only if we have both current and previous values
  calculatePercentageChangesForTrove(troveManager);
}

// Helper function to validate timestamp differences
function isValidPreviousTimestamp(
  priceDataPoints: PriceDataPoint[],
  prevPriceData: PriceDataPoint,
  daysAgo: number
): boolean {
  if (!prevPriceData || !prevPriceData.colUSDOracle || !prevPriceData.timestamp)
    return false;

  const latestTimestamp = parseInt(
    priceDataPoints[priceDataPoints.length - 1].timestamp,
    10
  );
  const prevTimestamp = parseInt(prevPriceData.timestamp, 10);
  const expectedDiff = daysAgo * 24 * 60 * 60; // days in seconds

  return Math.abs(latestTimestamp - prevTimestamp - expectedDiff) <= 60 * 60; // 1 hour tolerance
}

// Helper function to calculate percentage changes for a trove manager
function calculatePercentageChangesForTrove(troveManager: TroveManager): void {
  // TVL changes
  if (troveManager.currentColUSD && troveManager.prevDayColUSD) {
    const currentValue = parseFloat(troveManager.currentColUSD);
    const prevValue = parseFloat(troveManager.prevDayColUSD);
    if (prevValue > 0) {
      troveManager.tvlChange1d = ((currentValue - prevValue) / prevValue) * 100;
    }
  }

  if (troveManager.currentColUSD && troveManager.prev7DayColUSD) {
    const currentValue = parseFloat(troveManager.currentColUSD);
    const prevValue = parseFloat(troveManager.prev7DayColUSD);
    if (prevValue > 0) {
      troveManager.tvlChange7d = ((currentValue - prevValue) / prevValue) * 100;
    }
  }

  // Collateral ratio changes
  if (troveManager.colRatio && troveManager.prevDayColRatio) {
    const currentRatio = parseFloat(troveManager.colRatio);
    const prevRatio = parseFloat(troveManager.prevDayColRatio);
    if (prevRatio > 0) {
      troveManager.collateralRatioChange1d =
        ((currentRatio - prevRatio) / prevRatio) * 100;
    }
  }

  if (troveManager.colRatio && troveManager.prev7DayColRatio) {
    const currentRatio = parseFloat(troveManager.colRatio);
    const prevRatio = parseFloat(troveManager.prev7DayColRatio);
    if (prevRatio > 0) {
      troveManager.collateralRatioChange7d =
        ((currentRatio - prevRatio) / prevRatio) * 100;
    }
  }

  // Oracle price changes
  if (troveManager.currentColUSDOracle && troveManager.prevDayColUSDOracle) {
    const currentOracle = parseFloat(String(troveManager.currentColUSDOracle));
    const prevOracle = parseFloat(String(troveManager.prevDayColUSDOracle));
    if (prevOracle > 0) {
      troveManager.colUSDOracleChange1d =
        ((currentOracle - prevOracle) / prevOracle) * 100;
    }
  }

  if (troveManager.currentColUSDOracle && troveManager.prev7DayColUSDOracle) {
    const currentOracle = parseFloat(String(troveManager.currentColUSDOracle));
    const prevOracle = parseFloat(String(troveManager.prev7DayColUSDOracle));
    if (prevOracle > 0) {
      troveManager.colUSDOracleChange7d =
        ((currentOracle - prevOracle) / prevOracle) * 100;
    }
  }
}

// Process trove data for interest rates and liquidation prices
function processAdvancedTroveMetrics(
  troveManager: TroveManager,
  troveData: any[] | null,
  colImmutables: ColImmutables
): void {
  // Initialize advanced metrics
  troveManager.avgIR = null;
  troveManager.minIR = null;
  troveManager.maxLiqPrice = null;

  if (!troveData) return;
  if (!Array.isArray(troveData) || troveData.length === 0) return;

  // troveData is now directly the array of trove objects
  const actualTroveData = troveData;

  // Calculate interest rate metrics from active troves
  const activeInterestRates = actualTroveData
    .filter(
      (trove) =>
        trove.status === 1 &&
        trove.annualInterestRate &&
        trove.annualInterestRate !== "0"
    )
    .map((trove) => parseFloat(trove.annualInterestRate) / 1e16); // Convert to percentage

  if (activeInterestRates.length > 0) {
    // Calculate average and minimum interest rates
    const sumIR = activeInterestRates.reduce((sum, rate) => sum + rate, 0);
    troveManager.avgIR = (sumIR / activeInterestRates.length).toFixed(2);
    troveManager.minIR = Math.min(...activeInterestRates).toFixed(2);
  }

  // Calculate liquidation prices if MCR is available
  const mcr = colImmutables.MCR ? parseFloat(colImmutables.MCR) / 1e18 : 0;

  if (mcr > 0) {
    // Calculate liquidation prices for active troves with collateral and debt
    const liquidationPrices = actualTroveData
      .filter(
        (trove) =>
          trove.status === 1 &&
          trove.coll &&
          parseFloat(trove.coll) > 0 &&
          trove.entire_debt &&
          parseFloat(trove.entire_debt) > 0
      )
      .map((trove) => {
        const debt = parseFloat(trove.entire_debt);
        const coll = parseFloat(trove.coll);
        // Calculate liquidation price: (debt * MCR) / coll
        return (debt * mcr) / coll;
      });

    if (liquidationPrices.length > 0) {
      // Find maximum liquidation price
      troveManager.maxLiqPrice = Math.max(...liquidationPrices).toFixed(2);
    }
  }
}

// Set chain-level metrics based on aggregated trove manager data
function setChainLevelMetrics(
  chainData: ChainData,
  metrics: ChainMetrics
): void {
  const { current, prevDay, prev7Day } = metrics;

  // Initialize chain-level fields with null values
  chainData.prevDayProtocolTvl = null;
  chainData.prevDayProtocolColRatio = null;
  chainData.prevDayProtocolDebtBold = null;
  chainData.prevDayProtocolSpTvl = null;
  chainData.prev7DayProtocolTvl = null;
  chainData.prev7DayProtocolColRatio = null;
  chainData.prev7DayProtocolDebtBold = null;
  chainData.prev7DayProtocolSpTvl = null;
  chainData.prev7DayProtocolRedemptionTotal = null; // Initialize new field
  chainData.tvlChange1d = null;
  chainData.colRatioChange1d = null;
  chainData.debtBoldChange1d = null;
  chainData.spTvlChange1d = null;
  chainData.tvlChange7d = null;
  chainData.colRatioChange7d = null;
  chainData.debtBoldChange7d = null;
  chainData.spTvlChange7d = null;

  // Current day protocol metrics
  const currentTotalTvl = current.colUSD + current.spBold;
  chainData.currentProtocolTvl = formatProtocolMetricNumber(currentTotalTvl);
  chainData.currentProtocolColRatio =
    current.debtBold > 0
      ? formatProtocolMetricNumber(current.colUSD / current.debtBold)
      : null;
  chainData.currentProtocolDebtBold = formatProtocolMetricNumber(
    current.debtBold
  );
  chainData.currentProtocolSpTvl = formatProtocolMetricNumber(current.spBold);

  // Previous day protocol metrics
  const prevDayTotalTvl = prevDay.colUSD + prevDay.spBold;
  chainData.prevDayProtocolTvl =
    prevDayTotalTvl > 0 ? formatProtocolMetricNumber(prevDayTotalTvl) : null;
  chainData.prevDayProtocolColRatio =
    prevDay.debtBold > 0 && prevDay.colUSD > 0
      ? formatProtocolMetricNumber(prevDay.colUSD / prevDay.debtBold)
      : null;
  chainData.prevDayProtocolDebtBold =
    prevDay.debtBold > 0 ? formatProtocolMetricNumber(prevDay.debtBold) : null;
  chainData.prevDayProtocolSpTvl =
    prevDay.spBold > 0 ? formatProtocolMetricNumber(prevDay.spBold) : null;

  // 7-day previous protocol metrics
  const prev7DayTotalTvl = prev7Day.colUSD + prev7Day.spBold;
  chainData.prev7DayProtocolTvl =
    prev7DayTotalTvl > 0 ? formatProtocolMetricNumber(prev7DayTotalTvl) : null;
  chainData.prev7DayProtocolColRatio =
    prev7Day.debtBold > 0 && prev7Day.colUSD > 0
      ? formatProtocolMetricNumber(prev7Day.colUSD / prev7Day.debtBold)
      : null;
  chainData.prev7DayProtocolDebtBold =
    prev7Day.debtBold > 0
      ? formatProtocolMetricNumber(prev7Day.debtBold)
      : null;
  chainData.prev7DayProtocolSpTvl =
    prev7Day.spBold > 0 ? formatProtocolMetricNumber(prev7Day.spBold) : null;

  // Calculate protocol level redemption total by summing up redemption totals from all trove managers
  let totalProtocolRedemption = 0;
  Object.values(chainData.troveManagers).forEach((troveManager) => {
    if (troveManager.prev7DayRedemptionTotal) {
      totalProtocolRedemption += parseFloat(
        troveManager.prev7DayRedemptionTotal
      );
    }
  });

  // Set the redemption total if we found any redemption events
  if (totalProtocolRedemption > 0) {
    // Use toFixed(0) to ensure the value is represented as a full number without exponential notation
    chainData.prev7DayProtocolRedemptionTotal =
      totalProtocolRedemption.toFixed(0);
  } else {
    chainData.prev7DayProtocolRedemptionTotal = "0";
  }

  // Calculate percentage changes using the imported getPercentChange function
  chainData.tvlChange1d = getPercentChange(
    chainData.currentProtocolTvl,
    chainData.prevDayProtocolTvl
  );

  chainData.colRatioChange1d = getPercentChange(
    chainData.currentProtocolColRatio,
    chainData.prevDayProtocolColRatio
  );

  chainData.debtBoldChange1d = getPercentChange(
    chainData.currentProtocolDebtBold,
    chainData.prevDayProtocolDebtBold
  );

  chainData.spTvlChange1d = getPercentChange(
    chainData.currentProtocolSpTvl,
    chainData.prevDayProtocolSpTvl
  );

  // Calculate 7-day percentage changes
  chainData.tvlChange7d = getPercentChange(
    chainData.currentProtocolTvl,
    chainData.prev7DayProtocolTvl
  );

  chainData.colRatioChange7d = getPercentChange(
    chainData.currentProtocolColRatio,
    chainData.prev7DayProtocolColRatio
  );

  chainData.debtBoldChange7d = getPercentChange(
    chainData.currentProtocolDebtBold,
    chainData.prev7DayProtocolDebtBold
  );

  chainData.spTvlChange7d = getPercentChange(
    chainData.currentProtocolSpTvl,
    chainData.prev7DayProtocolSpTvl
  );
}

// Helper function to calculate previous metrics based on time period
function calculatePreviousMetrics(
  poolDataPoints: PoolDataPoint[],
  priceDataPoints: PriceDataPoint[],
  daysAgo: number,
  decimalsMultiplier: number
): {
  debtBold: string | null;
  colUSD: string | null;
  spBold: string | null;
  spColUsd: string | null;
  colRatio: string | null;
} | null {
  // Check if we have enough data points
  if (poolDataPoints.length <= daysAgo || priceDataPoints.length <= daysAgo) {
    return null; // Not enough data points
  }

  // Get latest data points
  const latestPoolData = poolDataPoints[poolDataPoints.length - 1];

  // Get previous data points directly from the array position
  const prevPoolData = poolDataPoints[poolDataPoints.length - daysAgo - 1];
  const prevPriceData = priceDataPoints[priceDataPoints.length - daysAgo - 1];

  // Skip if missing required data
  if (!latestPoolData || !prevPoolData || !prevPriceData) {
    return null;
  }

  // Check if the timestamp is exactly daysAgo days apart
  const latestTimestamp = parseInt(latestPoolData.timestamp, 10);
  const prevTimestamp = parseInt(prevPoolData.timestamp, 10);
  const expectedDiffSeconds = daysAgo * 24 * 60 * 60; // daysAgo days in seconds

  // Only return data if timestamp difference is exactly as expected (with a small margin)
  if (
    Math.abs(latestTimestamp - prevTimestamp - expectedDiffSeconds) >
    60 * 60
  ) {
    // More than 1 hour difference from expected - reject
    return null;
  }

  const result = {
    debtBold: null as string | null,
    colUSD: null as string | null,
    spBold: null as string | null,
    spColUsd: null as string | null,
    colRatio: null as string | null,
  };

  // Calculate previous debt
  if (prevPoolData.getEntireSystemDebt) {
    const debtValue = parseFloat(prevPoolData.getEntireSystemDebt) / 1e18;
    result.debtBold = formatProtocolMetricNumber(debtValue);
  }

  // Calculate previous collateral value
  if (
    prevPoolData.getEntireSystemColl !== undefined &&
    prevPriceData.colUSDPriceFeed !== undefined
  ) {
    const colUSD =
      (parseFloat(prevPoolData.getEntireSystemColl) *
        parseFloat(String(prevPriceData.colUSDPriceFeed))) /
      decimalsMultiplier;
    result.colUSD = formatProtocolMetricNumber(colUSD);
  }

  // Calculate previous stability pool BOLD
  if (
    prevPoolData.getTotalBoldDeposits !== undefined ||
    prevPoolData.getYieldGainsOwed !== undefined ||
    prevPoolData.getYieldGainsPending !== undefined
  ) {
    const spBoldValue =
      (parseFloat(prevPoolData.getTotalBoldDeposits || "0") +
        parseFloat(prevPoolData.getYieldGainsOwed || "0") +
        parseFloat(prevPoolData.getYieldGainsPending || "0")) /
      1e18;
    result.spBold = formatProtocolMetricNumber(spBoldValue);
  }

  // Calculate previous stability pool collateral in USD
  if (
    prevPoolData.getCollBalanceStabilityPool !== undefined &&
    prevPriceData.colUSDPriceFeed !== undefined
  ) {
    const spColUsdValue =
      (parseFloat(prevPoolData.getCollBalanceStabilityPool) *
        parseFloat(String(prevPriceData.colUSDPriceFeed))) /
      decimalsMultiplier;
    result.spColUsd = formatProtocolMetricNumber(spColUsdValue);
  }

  // Calculate previous collateral ratio
  if (result.colUSD && result.debtBold && result.debtBold !== "0") {
    const colRatioValue =
      parseFloat(result.colUSD) / parseFloat(result.debtBold);
    result.colRatio = formatProtocolMetricNumber(colRatioValue);
  }

  return result;
}
