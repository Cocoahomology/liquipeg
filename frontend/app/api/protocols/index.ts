import { slug } from "~/utils";
import type { Protocol } from "~/api/types";
import {
  PROTOCOL_CONFIG_API,
  POOL_DATA_CHART_API,
  LATEST_TROVE_DATA_API,
} from "~/constants";
import { fetchWithErrorLogging } from "~/utils/async";

const fetch = fetchWithErrorLogging;

export const getProtocols = () =>
  fetch(PROTOCOL_CONFIG_API).then((r) => r.json());

const getPoolDataChart = async (
  protocolId: number,
  chain: string,
  troveManagerIndex?: number
) => {
  for (let i = 0; i < 5; i++) {
    try {
      if (troveManagerIndex !== undefined) {
        return await fetch(
          `${POOL_DATA_CHART_API}/${protocolId}/${chain}?troveManagerIndex=${troveManagerIndex}`
        ).then((resp) => resp.json());
      } else {
        return await fetch(
          `${POOL_DATA_CHART_API}/${protocolId}/${chain}`
        ).then((resp) => resp.json());
      }
    } catch (e) {}
  }
  throw new Error(
    `${POOL_DATA_CHART_API}/${protocolId}/${chain}?troveManagerIndex=${troveManagerIndex} is broken`
  );
};

const getLatestTroves = async (
  protocolId: number,
  chain: string,
  troveManagerIndex?: number
) => {
  for (let i = 0; i < 5; i++) {
    try {
      if (troveManagerIndex !== undefined) {
        return await fetch(
          `${LATEST_TROVE_DATA_API}/${protocolId}/${chain}?troveManagerIndex=${troveManagerIndex}`
        ).then((resp) => resp.json());
      } else {
        return await fetch(
          `${LATEST_TROVE_DATA_API}/${protocolId}/${chain}`
        ).then((resp) => resp.json());
      }
    } catch (e) {}
  }
  throw new Error(
    `${LATEST_TROVE_DATA_API}/${protocolId}/${chain}?troveManagerIndex=${troveManagerIndex} is broken`
  );
};

export async function getProtocolsOverviewPageData() {
  const protocols = await getProtocols();

  // Will hold all the processed data grouped by protocol ID and chain
  const protocolDataByName = {};

  // Process each protocol
  await Promise.all(
    protocols.map(async (protocolData) => {
      const { protocolId, name, chains, immutables } = protocolData;

      // Create a copy of protocolData without troveManagers in immutables
      const protocolInfoCopy = { ...protocolData };

      // Remove troveManagers from immutables in the copy
      if (protocolInfoCopy.immutables) {
        protocolInfoCopy.immutables = Object.fromEntries(
          Object.entries(protocolInfoCopy.immutables).map(
            ([chainName, chainData]) => {
              if (chainData && typeof chainData === "object") {
                const { troveManagers, ...rest } = chainData as {
                  troveManagers?: any;
                  [key: string]: any;
                };
                return [chainName, rest];
              }
              return [chainName, chainData];
            }
          )
        );
      }

      // Use protocolId as key instead of name
      protocolDataByName[protocolId] = {
        protocolInfo: protocolInfoCopy,
        chainData: {},
      };

      // Process each chain for this protocol
      await Promise.all(
        chains.map(async (chainName) => {
          const chainImmutables = immutables[chainName];

          if (!chainImmutables || !chainImmutables.troveManagers) {
            return;
          }

          // Initialize the chain data structure
          protocolDataByName[protocolId].chainData[chainName] = {
            troveManagers: [],
          };

          // Process each trove manager for this chain (using the original immutables)
          await Promise.all(
            chainImmutables.troveManagers.map(async ({ troveManagerIndex }) => {
              // Fetch pool data chart with retry logic
              let poolDataChart;
              let retryCount = 0;
              const maxRetries = 5;

              while (retryCount < maxRetries) {
                try {
                  poolDataChart = await getPoolDataChart(
                    protocolId,
                    chainName,
                    troveManagerIndex
                  );

                  if (poolDataChart) {
                    break;
                  }
                } catch (error) {}
                retryCount++;
                await new Promise((resolve) =>
                  setTimeout(resolve, 200 * retryCount)
                );
              }

              if (!poolDataChart && retryCount === maxRetries) {
                throw new Error(
                  `Failed to fetch pool data after ${maxRetries} attempts for protocol ${protocolId}, chain ${chainName}, troveManager ${troveManagerIndex}`
                );
              }

              if (!poolDataChart || !poolDataChart.poolDataByDay) {
                return;
              }

              // Fetch trove data with similar retry logic
              let troveData;
              retryCount = 0;

              while (retryCount < maxRetries) {
                try {
                  troveData = await getLatestTroves(
                    protocolId,
                    chainName,
                    troveManagerIndex
                  );

                  if (troveData) {
                    break;
                  }
                } catch (error) {}
                retryCount++;
                await new Promise((resolve) =>
                  setTimeout(resolve, 200 * retryCount)
                );
              }

              if (!troveData && retryCount === maxRetries) {
                console.warn(
                  `Failed to fetch trove data after ${maxRetries} attempts for protocol ${protocolId}, chain ${chainName}, troveManager ${troveManagerIndex}`
                );
                // Continue without trove data instead of throwing an error
                troveData = null;
              }

              // Process pool data to separate poolData and priceData
              const poolDataPoints = [];
              const priceDataPoints = [];

              poolDataChart.poolDataByDay.forEach((dayData) => {
                const { date, timestamp, poolData, priceData } = dayData;

                if (poolData) {
                  poolDataPoints.push({
                    date,
                    timestamp,
                    ...poolData,
                  });
                }

                if (priceData) {
                  priceDataPoints.push({
                    date,
                    timestamp,
                    ...priceData,
                  });
                }
              });

              // Add processed data to the troveManagers array
              protocolDataByName[protocolId].chainData[
                chainName
              ].troveManagers.push({
                troveManagerIndex,
                poolDataPoints,
                priceDataPoints,
                // Add colImmutables from the protocol data
                colImmutables:
                  chainImmutables.troveManagers.find(
                    (tm) => tm.troveManagerIndex === troveManagerIndex
                  )?.colImmutables || {},
                // Add trove data if available
                troveData: troveData,
              });
            })
          );
        })
      );
    })
  );

  const formattedProtocolData = formatProtocolData(protocolDataByName);

  return formattedProtocolData;
}

// Helper function to calculate previous metrics based on time period
function calculatePreviousMetrics(
  troveManager,
  poolDataPoints,
  priceDataPoints,
  daysAgo,
  decimalsMultiplier
) {
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
  // This is a strict check - we require exactly daysAgo days difference
  if (
    Math.abs(latestTimestamp - prevTimestamp - expectedDiffSeconds) >
    60 * 60
  ) {
    // More than 1 hour difference from expected - reject
    return null;
  }

  const result = {
    debtBold: null,
    colUSD: null,
    spBold: null,
    spColUsd: null,
    colRatio: null,
  };

  // Calculate previous debt
  if (prevPoolData.getEntireSystemDebt) {
    const debtValue = parseFloat(prevPoolData.getEntireSystemDebt) / 1e18;
    result.debtBold = debtValue.toLocaleString("fullwide", {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
  }

  // Calculate previous collateral value
  if (
    prevPoolData.getEntireSystemColl !== undefined &&
    prevPriceData.colUSDPriceFeed !== undefined
  ) {
    const colUSD =
      (parseFloat(prevPoolData.getEntireSystemColl) *
        parseFloat(prevPriceData.colUSDPriceFeed)) /
      decimalsMultiplier;
    result.colUSD = colUSD.toLocaleString("fullwide", {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
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
    result.spBold = spBoldValue.toLocaleString("fullwide", {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
  }

  // Calculate previous stability pool collateral in USD
  if (
    prevPoolData.getCollBalanceStabilityPool !== undefined &&
    prevPriceData.colUSDPriceFeed !== undefined
  ) {
    const spColUsdValue =
      (parseFloat(prevPoolData.getCollBalanceStabilityPool) *
        parseFloat(prevPriceData.colUSDPriceFeed)) /
      decimalsMultiplier;
    result.spColUsd = spColUsdValue.toLocaleString("fullwide", {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
  }

  // Calculate previous collateral ratio
  if (result.colUSD && result.debtBold && result.debtBold !== "0") {
    const colRatioValue =
      parseFloat(result.colUSD) / parseFloat(result.debtBold);
    result.colRatio = colRatioValue.toLocaleString("fullwide", {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
  }

  return result;
}

// Helper function to calculate percentage change
function calculatePercentageChange(current, previous) {
  if (!current || !previous) return null;

  const currentValue = parseFloat(current);
  const previousValue = parseFloat(previous);

  if (previousValue <= 0) return null;

  const change = ((currentValue - previousValue) / previousValue) * 100;
  return change.toFixed(2);
}

function formatProtocolData(protocolDataByName) {
  // Process each protocol
  Object.keys(protocolDataByName).forEach((protocolId) => {
    const protocol = protocolDataByName[protocolId];

    // Process each chain in the protocol
    Object.keys(protocol.chainData).forEach((chainName) => {
      const chainData = protocol.chainData[chainName];

      // Initialize previous day metrics
      chainData.prevDayProtocolTvl = null;
      chainData.prevDayProtocolColRatio = null;
      chainData.prevDayProtocolDebtBold = null;
      chainData.prevDayProtocolSpTvl = null;

      // Initialize 7-day previous metrics
      chainData.prev7DayProtocolTvl = null;
      chainData.prev7DayProtocolColRatio = null;
      chainData.prev7DayProtocolDebtBold = null;
      chainData.prev7DayProtocolSpTvl = null;

      // Initialize percentage change metrics
      chainData.tvlChange1d = null;
      chainData.colRatioChange1d = null;
      chainData.debtBoldChange1d = null;
      chainData.spTvlChange1d = null;

      // Initialize 7-day percentage change metrics
      chainData.tvlChange7d = null;
      chainData.colRatioChange7d = null;
      chainData.debtBoldChange7d = null;
      chainData.spTvlChange7d = null;

      // Process each trove manager
      chainData.troveManagers.forEach((troveManager) => {
        const { poolDataPoints, priceDataPoints, colImmutables, troveData } =
          troveManager;

        // Initialize values as null
        troveManager.currentDebtBold = null;
        troveManager.currentColUSD = null;
        troveManager.currentSpBold = null;
        troveManager.currentSpColUsd = null;
        troveManager.colRatio = null;
        troveManager.currentColUSDOracle = null;
        troveManager.currentColUSDPriceFeed = null;
        troveManager.avgIR = null;
        troveManager.minIR = null;
        troveManager.maxLiqPrice = null;

        // Initialize previous day values
        troveManager.prevDayDebtBold = null;
        troveManager.prevDayColUSD = null;
        troveManager.prevDaySpBold = null;
        troveManager.prevDaySpColUsd = null;
        troveManager.prevDayColRatio = null;

        // Initialize 7-day previous values
        troveManager.prev7DayDebtBold = null;
        troveManager.prev7DayColUSD = null;
        troveManager.prev7DaySpBold = null;
        troveManager.prev7DaySpColUsd = null;
        troveManager.prev7DayColRatio = null;

        // Skip if no data points or not enough data points for comparison
        if (
          !poolDataPoints.length ||
          !priceDataPoints.length ||
          poolDataPoints.length < 2 ||
          priceDataPoints.length < 2
        )
          return;

        // Get latest data points
        const latestPoolData = poolDataPoints[poolDataPoints.length - 1];
        const latestPriceData = priceDataPoints[priceDataPoints.length - 1];

        // Skip if missing required data
        if (!latestPoolData || !latestPriceData) return;

        // Get decimal values from colImmutables
        const collTokenDecimals = parseInt(
          colImmutables.collTokenDecimals || "18",
          10
        );
        const decimalsMultiplier = Math.pow(10, collTokenDecimals);

        // Calculate current day metrics
        if (latestPoolData.getEntireSystemDebt) {
          // Divide by 10^18 for debt
          const debtValue =
            parseFloat(latestPoolData.getEntireSystemDebt) / 1e18;
          // Format to avoid exponential notation
          troveManager.currentDebtBold = debtValue.toLocaleString("fullwide", {
            useGrouping: false,
            maximumFractionDigits: 20,
          });
        }

        if (
          latestPoolData.getEntireSystemColl &&
          latestPriceData.colUSDPriceFeed
        ) {
          const currentColUSD =
            (parseFloat(latestPoolData.getEntireSystemColl) *
              parseFloat(latestPriceData.colUSDPriceFeed)) /
            decimalsMultiplier;
          // Format to avoid exponential notation
          troveManager.currentColUSD = currentColUSD.toLocaleString(
            "fullwide",
            { useGrouping: false, maximumFractionDigits: 20 }
          );
        }

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
          // Format to avoid exponential notation
          troveManager.currentSpBold = spBoldValue.toLocaleString("fullwide", {
            useGrouping: false,
            maximumFractionDigits: 20,
          });
        }

        // Calculate stability pool collateral in USD
        if (
          latestPoolData.getCollBalanceStabilityPool &&
          latestPriceData.colUSDPriceFeed
        ) {
          const spColUsdValue =
            (parseFloat(latestPoolData.getCollBalanceStabilityPool) *
              parseFloat(latestPriceData.colUSDPriceFeed)) /
            decimalsMultiplier;
          // Format to avoid exponential notation
          troveManager.currentSpColUsd = spColUsdValue.toLocaleString(
            "fullwide",
            {
              useGrouping: false,
              maximumFractionDigits: 20,
            }
          );
        }

        if (
          troveManager.currentColUSD &&
          troveManager.currentDebtBold &&
          troveManager.currentDebtBold !== "0"
        ) {
          const colRatioValue =
            parseFloat(troveManager.currentColUSD) /
            parseFloat(troveManager.currentDebtBold);
          // Format to avoid exponential notation
          troveManager.colRatio = colRatioValue.toLocaleString("fullwide", {
            useGrouping: false,
            maximumFractionDigits: 20,
          });
        }

        if (latestPriceData.colUSDOracle) {
          troveManager.currentColUSDOracle = latestPriceData.colUSDOracle;
        }

        // Add the price feed from the latest price data
        if (latestPriceData.colUSDPriceFeed) {
          troveManager.currentColUSDPriceFeed = latestPriceData.colUSDPriceFeed;
        }

        // Process trove data if available
        if (troveData && troveData.length > 0) {
          // Find the trove data entry that matches this trove manager index
          const matchingTroveData = troveData.find(
            (td) => td.troveManagerIndex === troveManager.troveManagerIndex
          );

          if (matchingTroveData && matchingTroveData.troveData) {
            const actualTroveData = matchingTroveData.troveData;

            // Calculate interest rate metrics from active troves (status 1 is active)
            const activeInterestRates = actualTroveData
              .filter(
                (trove) =>
                  trove.status === 1 &&
                  trove.annualInterestRate &&
                  trove.annualInterestRate !== "0"
              )
              .map((trove) => parseFloat(trove.annualInterestRate) / 1e16); // Convert to percentage

            if (activeInterestRates.length > 0) {
              // Calculate average interest rate
              const sumIR = activeInterestRates.reduce(
                (sum, rate) => sum + rate,
                0
              );
              troveManager.avgIR = (sumIR / activeInterestRates.length).toFixed(
                2
              );

              // Calculate minimum interest rate
              troveManager.minIR = Math.min(...activeInterestRates).toFixed(2);
            }

            // Get MCR value
            const mcr = colImmutables.MCR
              ? parseFloat(colImmutables.MCR) / 1e18
              : 0;

            if (mcr > 0) {
              // Calculate liquidation prices for active troves
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
                  const liqPrice = (debt * mcr) / coll;
                  return liqPrice;
                });

              if (liquidationPrices.length > 0) {
                // Find the trove with the maximum liquidation price
                const maxLiqPriceData = liquidationPrices.reduce(
                  (max, current) => (current > max ? current : max)
                );

                // Set the max liquidation price
                troveManager.maxLiqPrice = maxLiqPriceData.toFixed(2);
              }
            }
          }
        }

        // Calculate previous day metrics using helper function
        const prevDayMetrics = calculatePreviousMetrics(
          troveManager,
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
        } else {
          // Fallback: Use the second-to-last entry directly if helper function fails
          const prevDayPoolData = poolDataPoints[poolDataPoints.length - 2];
          const prevDayPriceData = priceDataPoints[priceDataPoints.length - 2];

          if (
            prevDayPoolData &&
            prevDayPriceData &&
            prevDayPoolData.timestamp &&
            poolDataPoints[poolDataPoints.length - 1].timestamp
          ) {
            // Validate timestamp difference for 1-day data
            const latestTimestamp = parseInt(
              poolDataPoints[poolDataPoints.length - 1].timestamp,
              10
            );
            const prevTimestamp = parseInt(prevDayPoolData.timestamp, 10);
            const expectedDiff = 24 * 60 * 60; // 1 day in seconds

            // Only perform calculations if timestamps are valid (within 1 hour tolerance)
            if (
              Math.abs(latestTimestamp - prevTimestamp - expectedDiff) <=
              60 * 60
            ) {
              // Implement direct calculation for previous day metrics
              if (prevDayPoolData.getEntireSystemDebt) {
                const prevDebtValue =
                  parseFloat(prevDayPoolData.getEntireSystemDebt) / 1e18;
                troveManager.prevDayDebtBold = prevDebtValue.toLocaleString(
                  "fullwide",
                  {
                    useGrouping: false,
                    maximumFractionDigits: 20,
                  }
                );
              }

              if (
                prevDayPoolData.getEntireSystemColl &&
                prevDayPriceData.colUSDPriceFeed
              ) {
                const prevColUSD =
                  (parseFloat(prevDayPoolData.getEntireSystemColl) *
                    parseFloat(prevDayPriceData.colUSDPriceFeed)) /
                  decimalsMultiplier;
                troveManager.prevDayColUSD = prevColUSD.toLocaleString(
                  "fullwide",
                  {
                    useGrouping: false,
                    maximumFractionDigits: 20,
                  }
                );
              }

              if (
                prevDayPoolData.getTotalBoldDeposits ||
                prevDayPoolData.getYieldGainsOwed ||
                prevDayPoolData.getYieldGainsPending
              ) {
                const prevSpBoldValue =
                  (parseFloat(prevDayPoolData.getTotalBoldDeposits || "0") +
                    parseFloat(prevDayPoolData.getYieldGainsOwed || "0") +
                    parseFloat(prevDayPoolData.getYieldGainsPending || "0")) /
                  1e18;
                troveManager.prevDaySpBold = prevSpBoldValue.toLocaleString(
                  "fullwide",
                  {
                    useGrouping: false,
                    maximumFractionDigits: 20,
                  }
                );
              }

              if (
                prevDayPoolData.getCollBalanceStabilityPool &&
                prevDayPriceData.colUSDPriceFeed
              ) {
                const prevSpColUsdValue =
                  (parseFloat(prevDayPoolData.getCollBalanceStabilityPool) *
                    parseFloat(prevDayPriceData.colUSDPriceFeed)) /
                  decimalsMultiplier;
                troveManager.prevDaySpColUsd = prevSpColUsdValue.toLocaleString(
                  "fullwide",
                  {
                    useGrouping: false,
                    maximumFractionDigits: 20,
                  }
                );
              }

              if (
                troveManager.prevDayColUSD &&
                troveManager.prevDayDebtBold &&
                troveManager.prevDayDebtBold !== "0"
              ) {
                const prevColRatioValue =
                  parseFloat(troveManager.prevDayColUSD) /
                  parseFloat(troveManager.prevDayDebtBold);
                troveManager.prevDayColRatio = prevColRatioValue.toLocaleString(
                  "fullwide",
                  {
                    useGrouping: false,
                    maximumFractionDigits: 20,
                  }
                );
              }
            }
          }
        }

        // Calculate 7-day previous metrics
        const prev7DayMetrics = calculatePreviousMetrics(
          troveManager,
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

        // Extract oracle prices from priceDataPoints
        if (priceDataPoints && priceDataPoints.length > 1) {
          // Get 1-day previous oracle price if available
          const prevDayPriceData = priceDataPoints[priceDataPoints.length - 2];

          // Check timestamp difference for 1-day data
          if (
            prevDayPriceData &&
            prevDayPriceData.colUSDOracle &&
            prevDayPriceData.timestamp &&
            priceDataPoints[priceDataPoints.length - 1].timestamp
          ) {
            const latestTimestamp = parseInt(
              priceDataPoints[priceDataPoints.length - 1].timestamp,
              10
            );
            const prevTimestamp = parseInt(prevDayPriceData.timestamp, 10);
            const expectedDiff = 24 * 60 * 60; // 1 day in seconds

            if (
              Math.abs(latestTimestamp - prevTimestamp - expectedDiff) <=
              60 * 60
            ) {
              troveManager.prevDayColUSDOracle = prevDayPriceData.colUSDOracle;
            }
          }

          // Get 7-day previous oracle price if available
          if (priceDataPoints.length >= 8) {
            const prev7DayPriceData =
              priceDataPoints[priceDataPoints.length - 8];

            // Check timestamp difference for 7-day data
            if (
              prev7DayPriceData &&
              prev7DayPriceData.colUSDOracle &&
              prev7DayPriceData.timestamp &&
              priceDataPoints[priceDataPoints.length - 1].timestamp
            ) {
              const latestTimestamp = parseInt(
                priceDataPoints[priceDataPoints.length - 1].timestamp,
                10
              );
              const prevTimestamp = parseInt(prev7DayPriceData.timestamp, 10);
              const expectedDiff = 7 * 24 * 60 * 60; // 7 days in seconds

              if (
                Math.abs(latestTimestamp - prevTimestamp - expectedDiff) <=
                60 * 60
              ) {
                troveManager.prev7DayColUSDOracle =
                  prev7DayPriceData.colUSDOracle;
              }
            }
          }
        }

        // Calculate percentage changes for trove manager metrics
        // TVL changes
        if (troveManager.currentColUSD && troveManager.prevDayColUSD) {
          const currentValue = parseFloat(troveManager.currentColUSD);
          const prevValue = parseFloat(troveManager.prevDayColUSD);
          if (prevValue > 0) {
            troveManager.tvlChange1d =
              ((currentValue - prevValue) / prevValue) * 100;
          }
        } else {
          troveManager.tvlChange1d = null;
        }

        if (troveManager.currentColUSD && troveManager.prev7DayColUSD) {
          const currentValue = parseFloat(troveManager.currentColUSD);
          const prevValue = parseFloat(troveManager.prev7DayColUSD);
          if (prevValue > 0) {
            troveManager.tvlChange7d =
              ((currentValue - prevValue) / prevValue) * 100;
          }
        } else {
          troveManager.tvlChange7d = null;
        }

        // Collateral ratio changes
        if (troveManager.colRatio && troveManager.prevDayColRatio) {
          const currentRatio = parseFloat(troveManager.colRatio);
          const prevRatio = parseFloat(troveManager.prevDayColRatio);
          if (prevRatio > 0) {
            troveManager.collateralRatioChange1d =
              ((currentRatio - prevRatio) / prevRatio) * 100;
          }
        } else {
          troveManager.collateralRatioChange1d = null;
        }

        if (troveManager.colRatio && troveManager.prev7DayColRatio) {
          const currentRatio = parseFloat(troveManager.colRatio);
          const prevRatio = parseFloat(troveManager.prev7DayColRatio);
          if (prevRatio > 0) {
            troveManager.collateralRatioChange7d =
              ((currentRatio - prevRatio) / prevRatio) * 100;
          }
        } else {
          troveManager.collateralRatioChange7d = null;
        }

        // Oracle price changes
        if (
          troveManager.currentColUSDOracle &&
          troveManager.prevDayColUSDOracle
        ) {
          const currentOracle = parseFloat(
            String(troveManager.currentColUSDOracle)
          );
          const prevOracle = parseFloat(
            String(troveManager.prevDayColUSDOracle)
          );
          if (prevOracle > 0) {
            troveManager.colUSDOracleChange1d =
              ((currentOracle - prevOracle) / prevOracle) * 100;
          }
        } else {
          troveManager.colUSDOracleChange1d = null;
        }

        if (
          troveManager.currentColUSDOracle &&
          troveManager.prev7DayColUSDOracle
        ) {
          const currentOracle = parseFloat(
            String(troveManager.currentColUSDOracle)
          );
          const prevOracle = parseFloat(
            String(troveManager.prev7DayColUSDOracle)
          );
          if (prevOracle > 0) {
            troveManager.colUSDOracleChange7d =
              ((currentOracle - prevOracle) / prevOracle) * 100;
          }
        } else {
          troveManager.colUSDOracleChange7d = null;
        }
      });

      // Calculate chain-level metrics by summing across all trove managers
      let sumColUSD = 0;
      let sumDebtBold = 0;
      let sumSpBold = 0;
      let sumSpColUsd = 0;

      // For previous day metrics
      let sumPrevColUSD = 0;
      let sumPrevDebtBold = 0;
      let sumPrevSpBold = 0;
      let sumPrevSpColUsd = 0;

      // For 7-day previous metrics
      let sum7DayColUSD = 0;
      let sum7DayDebtBold = 0;
      let sum7DaySpBold = 0;
      let sum7DaySpColUsd = 0;

      // Sum values from all trove managers
      chainData.troveManagers.forEach((troveManager) => {
        // Current day values
        if (troveManager.currentColUSD) {
          sumColUSD += parseFloat(troveManager.currentColUSD);
        }

        if (troveManager.currentDebtBold) {
          sumDebtBold += parseFloat(troveManager.currentDebtBold);
        }

        if (troveManager.currentSpBold) {
          sumSpBold += parseFloat(troveManager.currentSpBold);
        }

        if (troveManager.currentSpColUsd) {
          sumSpColUsd += parseFloat(troveManager.currentSpColUsd);
        }

        // Previous day values
        if (troveManager.prevDayColUSD) {
          sumPrevColUSD += parseFloat(troveManager.prevDayColUSD);
        }

        if (troveManager.prevDayDebtBold) {
          sumPrevDebtBold += parseFloat(troveManager.prevDayDebtBold);
        }

        if (troveManager.prevDaySpBold) {
          sumPrevSpBold += parseFloat(troveManager.prevDaySpBold);
        }

        if (troveManager.prevDaySpColUsd) {
          sumPrevSpColUsd += parseFloat(troveManager.prevDaySpColUsd);
        }

        // 7-day previous values
        if (troveManager.prev7DayColUSD) {
          sum7DayColUSD += parseFloat(troveManager.prev7DayColUSD);
        }

        if (troveManager.prev7DayDebtBold) {
          sum7DayDebtBold += parseFloat(troveManager.prev7DayDebtBold);
        }

        if (troveManager.prev7DaySpBold) {
          sum7DaySpBold += parseFloat(troveManager.prev7DaySpBold);
        }

        if (troveManager.prev7DaySpColUsd) {
          sum7DaySpColUsd += parseFloat(troveManager.prev7DaySpColUsd);
        }
      });

      // Add chain-level metrics for current day
      chainData.currentProtocolTvl = (sumColUSD + sumSpBold).toLocaleString(
        "fullwide",
        {
          useGrouping: false,
          maximumFractionDigits: 20,
        }
      );

      chainData.currentProtocolColRatio =
        sumDebtBold > 0
          ? (sumColUSD / sumDebtBold).toLocaleString("fullwide", {
              useGrouping: false,
              maximumFractionDigits: 20,
            })
          : null;

      chainData.currentProtocolDebtBold = sumDebtBold.toLocaleString(
        "fullwide",
        {
          useGrouping: false,
          maximumFractionDigits: 20,
        }
      );

      chainData.currentProtocolSpTvl = sumSpBold.toLocaleString("fullwide", {
        useGrouping: false,
        maximumFractionDigits: 20,
      });

      // Add chain-level metrics for previous day
      const prevDayTotalTvl = sumPrevColUSD + sumPrevSpBold;
      chainData.prevDayProtocolTvl =
        prevDayTotalTvl > 0
          ? prevDayTotalTvl.toLocaleString("fullwide", {
              useGrouping: false,
              maximumFractionDigits: 20,
            })
          : null;

      chainData.prevDayProtocolColRatio =
        sumPrevDebtBold > 0 && sumPrevColUSD > 0
          ? (sumPrevColUSD / sumPrevDebtBold).toLocaleString("fullwide", {
              useGrouping: false,
              maximumFractionDigits: 20,
            })
          : null;

      chainData.prevDayProtocolDebtBold =
        sumPrevDebtBold > 0
          ? sumPrevDebtBold.toLocaleString("fullwide", {
              useGrouping: false,
              maximumFractionDigits: 20,
            })
          : null;

      chainData.prevDayProtocolSpTvl =
        sumPrevSpBold > 0
          ? sumPrevSpBold.toLocaleString("fullwide", {
              useGrouping: false,
              maximumFractionDigits: 20,
            })
          : null;

      // Add chain-level metrics for 7 days ago
      const prev7DayTotalTvl = sum7DayColUSD + sum7DaySpBold;
      chainData.prev7DayProtocolTvl =
        prev7DayTotalTvl > 0
          ? prev7DayTotalTvl.toLocaleString("fullwide", {
              useGrouping: false,
              maximumFractionDigits: 20,
            })
          : null;

      chainData.prev7DayProtocolColRatio =
        sum7DayDebtBold > 0 && sum7DayColUSD > 0
          ? (sum7DayColUSD / sum7DayDebtBold).toLocaleString("fullwide", {
              useGrouping: false,
              maximumFractionDigits: 20,
            })
          : null;

      chainData.prev7DayProtocolDebtBold =
        sum7DayDebtBold > 0
          ? sum7DayDebtBold.toLocaleString("fullwide", {
              useGrouping: false,
              maximumFractionDigits: 20,
            })
          : null;

      chainData.prev7DayProtocolSpTvl =
        sum7DaySpBold > 0
          ? sum7DaySpBold.toLocaleString("fullwide", {
              useGrouping: false,
              maximumFractionDigits: 20,
            })
          : null;

      // Calculate percentage changes using helper function
      chainData.tvlChange1d = calculatePercentageChange(
        chainData.currentProtocolTvl,
        chainData.prevDayProtocolTvl
      );

      chainData.colRatioChange1d = calculatePercentageChange(
        chainData.currentProtocolColRatio,
        chainData.prevDayProtocolColRatio
      );

      chainData.debtBoldChange1d = calculatePercentageChange(
        chainData.currentProtocolDebtBold,
        chainData.prevDayProtocolDebtBold
      );

      chainData.spTvlChange1d = calculatePercentageChange(
        chainData.currentProtocolSpTvl,
        chainData.prevDayProtocolSpTvl
      );

      // Calculate 7-day percentage changes
      chainData.tvlChange7d = calculatePercentageChange(
        chainData.currentProtocolTvl,
        chainData.prev7DayProtocolTvl
      );

      chainData.colRatioChange7d = calculatePercentageChange(
        chainData.currentProtocolColRatio,
        chainData.prev7DayProtocolColRatio
      );

      chainData.debtBoldChange7d = calculatePercentageChange(
        chainData.currentProtocolDebtBold,
        chainData.prev7DayProtocolDebtBold
      );

      chainData.spTvlChange7d = calculatePercentageChange(
        chainData.currentProtocolSpTvl,
        chainData.prev7DayProtocolSpTvl
      );
    });
  });

  return protocolDataByName;
}
