import { fetchApi } from "~/utils/async";
import { getProtocolsOverviewPageData } from ".";
import { useQuery } from "@tanstack/react-query";

// New query function for protocols data with 10 minute cache
export const useGetProtocolsOverviewData = () => {
  return useQuery({
    queryKey: ["protocolsOverviewData"],
    queryFn: () => getProtocolsOverviewPageData(),
    staleTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
  });
};

// Helper function to format protocol data for the UI
export const formatProtocolDataForUI = (data) => {
  if (!data) return [];

  const formatted = [];

  Object.keys(data).forEach((protocolId) => {
    const protocol = data[protocolId];
    const { protocolInfo, chainData } = protocol;

    Object.keys(chainData).forEach((chain) => {
      const chainInfo = chainData[chain];

      // Format protocol level redemption total by dividing by 1e18
      const prev7DayProtocolRedemptionTotal =
        chainInfo.prev7DayProtocolRedemptionTotal
          ? parseFloat(chainInfo.prev7DayProtocolRedemptionTotal) / 1e18
          : 0;

      // Create formatted protocol object with only the essential data needed for the UI
      const formattedProtocol = {
        id: `${protocolId}-${chain}`,
        name: protocolInfo.displayName || protocolInfo.name,
        displayName: protocolInfo.name,
        chain: chain,
        tvl: parseFloat(chainInfo.currentProtocolTvl || "0"),
        tvlChange1d: chainInfo.tvlChange1d
          ? parseFloat(chainInfo.tvlChange1d)
          : null,
        tvlChange7d: chainInfo.tvlChange7d
          ? parseFloat(chainInfo.tvlChange7d)
          : null,
        collateralRatio:
          parseFloat(chainInfo.currentProtocolColRatio || "0") * 100,
        collateralRatioChange1d: chainInfo.colRatioChange1d
          ? parseFloat(chainInfo.colRatioChange1d)
          : null,
        collateralRatioChange7d: chainInfo.colRatioChange7d
          ? parseFloat(chainInfo.colRatioChange7d)
          : null,
        stableDebt: parseFloat(chainInfo.currentProtocolDebtBold || "0"),
        stableDebtChange1d: chainInfo.debtBoldChange1d
          ? parseFloat(chainInfo.debtBoldChange1d)
          : null,
        stableDebtChange7d: chainInfo.debtBoldChange7d
          ? parseFloat(chainInfo.debtBoldChange7d)
          : null,
        spTvl: parseFloat(chainInfo.currentProtocolSpTvl || "0"),
        spTvlChange1d: chainInfo.spTvlChange1d
          ? parseFloat(chainInfo.spTvlChange1d)
          : null,
        spTvlChange7d: chainInfo.spTvlChange7d
          ? parseFloat(chainInfo.spTvlChange7d)
          : null,
        prev7DayProtocolRedemptionTotal: prev7DayProtocolRedemptionTotal,
        iconLink: protocolInfo.iconLink || "",
        url: protocolInfo.url || "",
        troveManagers: chainInfo.troveManagers
          ? Object.values(chainInfo.troveManagers)
              .map((tm) => formatTroveManagerForUI(tm, protocolId, chain))
              .filter(Boolean)
          : {},
      };

      // Sort troveManagers by TVL in descending order
      if (
        Array.isArray(formattedProtocol.troveManagers) &&
        formattedProtocol.troveManagers.length
      ) {
        formattedProtocol.troveManagers.sort((a, b) => b.tvl - a.tvl);
      }

      formatted.push(formattedProtocol);
    });
  });

  return formatted.map((protocol) => {
    // Extract protocol ID and chain from the compound ID (format: "id-chain")
    const [protocolId, chain] = protocol.id.split("-");

    // Check if protocolsData is an array or an object with keys
    const rawProtocol = Array.isArray(data)
      ? data.find((p) => p.id === protocolId)
      : data[protocolId];

    return {
      ...protocol,
      chartData: rawProtocol
        ? generateChartData(rawProtocol, chain)
        : undefined,
      troveManagerChartData: rawProtocol
        ? generateTroveManagerChartData(rawProtocol, chain)
        : undefined,
    };
  });
};

// Extract trove manager formatting to a separate function
function formatTroveManagerForUI(tm, protocolId, chain) {
  // Skip trove managers with insufficient data
  if (!tm.colImmutables || !tm.currentColUSD) {
    return null;
  }

  // Process CCR, MCR, SCR values
  const ccr = tm.colImmutables.CCR
    ? Math.floor(parseFloat(tm.colImmutables.CCR) / 10 ** 16)
    : 0;
  const mcr = tm.colImmutables.MCR
    ? Math.floor(parseFloat(tm.colImmutables.MCR) / 10 ** 16)
    : 0;
  const scr = tm.colImmutables.SCR
    ? Math.floor(parseFloat(tm.colImmutables.SCR) / 10 ** 16)
    : 0;

  // Format prev7DayRedemptionTotal - divide by 1e18 as requested
  const prev7DayRedemptionTotal = tm.prev7DayRedemptionTotal
    ? parseFloat(tm.prev7DayRedemptionTotal) / 1e18
    : 0;

  // Only include properties needed for the UI to reduce unnecessary conversions
  return {
    id: `${protocolId}-${chain}`,
    index: tm.troveManagerIndex,
    collateralSymbol: tm.colImmutables.collTokenSymbol || "Unknown",
    tvl: parseFloat(tm.currentColUSD || "0"),
    prevDayTvl: tm.prevDayColUSD ? parseFloat(tm.prevDayColUSD) : null,
    prev7DayTvl: tm.prev7DayColUSD ? parseFloat(tm.prev7DayColUSD) : null,
    tvlChange1d: tm.tvlChange1d !== undefined ? tm.tvlChange1d : null,
    tvlChange7d: tm.tvlChange7d !== undefined ? tm.tvlChange7d : null,
    collateralRatio: parseFloat(tm.colRatio || "0") * 100,
    prevDayCollateralRatio: tm.prevDayColRatio
      ? parseFloat(tm.prevDayColRatio) * 100
      : null,
    prev7DayCollateralRatio: tm.prev7DayColRatio
      ? parseFloat(tm.prev7DayColRatio) * 100
      : null,
    collateralRatioChange1d: tm.collateralRatioChange1d,
    collateralRatioChange7d: tm.collateralRatioChange7d,
    ratioSettings: `${ccr}/${mcr}/${scr}`,
    ccr: ccr,
    currentColUSDOracle: tm.currentColUSDOracle || "",
    prevDayColUSDOracle: tm.prevDayColUSDOracle || null,
    prev7DayColUSDOracle: tm.prev7DayColUSDOracle || null,
    colUSDOracleChange1d: tm.colUSDOracleChange1d,
    colUSDOracleChange7d: tm.colUSDOracleChange7d,
    avgIR: tm.avgIR || "",
    minIR: tm.minIR || "",
    maxLiqPrice: tm.maxLiqPrice || "",
    prev7DayRedemptionTotal: prev7DayRedemptionTotal,
  };
}

// Helper function to find the closest price point by timestamp
function findClosestPricePoint(timestamp: number, priceDataPoints: any[]) {
  if (!priceDataPoints || priceDataPoints.length === 0) return null;

  // Sort by how close each point is to the target timestamp
  const sortedPoints = [...priceDataPoints].sort((a, b) => {
    return (
      Math.abs(a.timestamp - timestamp) - Math.abs(b.timestamp - timestamp)
    );
  });

  return sortedPoints[0];
}

// Helper function to get a color based on index
function getColorForIndex(index: number) {
  // Array of colors to use for different trove managers
  const colors = [
    "#f87171", // Red
    "#60a5fa", // Blue
    "#4ade80", // Green
    "#facc15", // Yellow
    "#a78bfa", // Purple
    "#fb923c", // Orange
    "#34d399", // Emerald
    "#f472b6", // Pink
  ];

  // Return a color from the array, wrapping around if needed
  return colors[index % colors.length];
}

// Helper function to calculate TVL and ratio data for charts
function calculateTvlAndRatioData(
  poolDataPoints: any[],
  priceDataPoints: any[],
  decimalsMultiplier: number
) {
  // Create a lookup table for price data based on timestamp
  const priceByTimestamp = {};
  priceDataPoints.forEach((point) => {
    priceByTimestamp[point.timestamp] = point;
  });

  // Arrays to store both CR and TVL data points
  const ratioData = [];
  const tvlData = [];

  // Calculate data for each point in poolDataPoints
  poolDataPoints.forEach((poolPoint) => {
    // Find the closest price data for this timestamp
    const pricePoint =
      priceByTimestamp[poolPoint.timestamp] ||
      findClosestPricePoint(poolPoint.timestamp, priceDataPoints);

    if (
      !pricePoint ||
      !poolPoint.getEntireSystemColl ||
      !poolPoint.getEntireSystemDebt
    ) {
      return;
    }

    // Parse values as numbers
    const systemColl = parseFloat(poolPoint.getEntireSystemColl);
    const systemDebt = parseFloat(poolPoint.getEntireSystemDebt);
    const colPrice = parseFloat(
      pricePoint.colUSDPriceFeed || pricePoint.colUSDOracle
    );

    // Skip if any value is invalid
    if (
      isNaN(systemColl) ||
      isNaN(systemDebt) ||
      isNaN(colPrice) ||
      systemDebt === 0
    ) {
      return;
    }

    const timestamp = poolPoint.timestamp * 1000; // Convert to milliseconds for chart

    // Calculate TVL
    const tvl = (systemColl / decimalsMultiplier) * colPrice;
    tvlData.push({
      date: timestamp,
      value: tvl,
    });

    // Calculate ratio (convert to percentage)
    const normalizedColl = systemColl * (Math.pow(10, 18) / decimalsMultiplier);
    const ratio = ((normalizedColl * colPrice) / systemDebt) * 100;
    ratioData.push({
      date: timestamp,
      value: ratio,
    });
  });

  return { tvlData, ratioData };
}

// Helper function to calculate liquidation data
function calculateLiquidationData(eventData: any[]) {
  // Create a lookup to store total daily liquidations
  const dailyLiquidations = new Map<number, number>();

  if (!eventData || !Array.isArray(eventData)) {
    return [];
  }

  // Process each event entry
  eventData.forEach((entry) => {
    if (!entry.timestamp || !entry.events || !Array.isArray(entry.events)) {
      return;
    }

    const timestamp = entry.timestamp * 1000; // Convert to milliseconds

    // Get day-level timestamp (midnight of the day)
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    const dayTimestamp = date.getTime();

    // Sum liquidation amounts for this entry
    let entryLiquidationSum = 0;

    entry.events.forEach((event) => {
      if (event.operation === 5 || event.eventData?.operation === "5") {
        const debtChange = parseFloat(
          event.eventData?.debtChangeFromOperation || "0"
        );
        if (debtChange < 0) {
          // Add absolute value of debt change
          entryLiquidationSum += Math.abs(debtChange);
        }
      }
    });

    // Add to daily total
    if (entryLiquidationSum > 0) {
      const currentTotal = dailyLiquidations.get(dayTimestamp) || 0;
      dailyLiquidations.set(dayTimestamp, currentTotal + entryLiquidationSum);
    }
  });

  // Convert Map to array of data points, sorted by date
  if (dailyLiquidations.size > 0) {
    return Array.from(dailyLiquidations.entries())
      .map(([timestamp, value]) => ({
        date: timestamp,
        value: value / 1e18, // Convert from wei to token units
      }))
      .sort((a, b) => a.date - b.date);
  }

  return [];
}

// Helper function to create chart series from data
function createChartSeries(options: {
  name: string;
  data: any[];
  type: "line" | "bar";
  color: string;
  yAxisIndex: number;
  showInLegend?: boolean;
  barWidth?: number;
}) {
  const { name, data, type, color, yAxisIndex, showInLegend, barWidth } =
    options;

  return {
    name,
    type,
    data,
    color,
    yAxisIndex,
    showInLegend: showInLegend !== undefined ? showInLegend : true,
    barWidth: barWidth || undefined,
  };
}

// Helper function to extract price data series from price data points
function calculatePriceData(priceDataPoints: any[]) {
  // Arrays to store price data points
  const oraclePriceData = [];
  const priceFeedData = [];

  // Process each price data point
  priceDataPoints.forEach((pricePoint) => {
    if (!pricePoint.timestamp) {
      return;
    }

    const timestamp = pricePoint.timestamp * 1000; // Convert to milliseconds for chart

    // Extract Oracle Price if available
    if (pricePoint.colUSDOracle) {
      const oraclePrice = parseFloat(pricePoint.colUSDOracle);
      if (!isNaN(oraclePrice)) {
        oraclePriceData.push({
          date: timestamp,
          value: oraclePrice,
        });
      }
    }

    // Extract SC Price (price feed) if available
    if (pricePoint.colUSDPriceFeed) {
      const feedPrice = parseFloat(pricePoint.colUSDPriceFeed);
      if (!isNaN(feedPrice)) {
        priceFeedData.push({
          date: timestamp,
          value: feedPrice,
        });
      }
    }
  });

  return { oraclePriceData, priceFeedData };
}

function generateChartData(protocol: any, chain: string) {
  console.log("PROTOCOL FOR CHART DATA:", protocol, "Chain:", chain);

  // Initialize series arrays for our charts
  const crDaSeries = [];
  const pricesLiqsSeries = [];

  // Create a collection of all trove manager liquidations for the protocol level
  const allLiquidationsData = [];

  // Process each trove manager's data for charts
  Object.entries(protocol.chainData[chain].troveManagers).forEach(
    ([troveManagerIndex, troveManagerData]: [string, any]) => {
      const { poolDataPoints, priceDataPoints, colImmutables, eventData } =
        troveManagerData;
      const { collTokenSymbol: symbol, collTokenDecimals } = colImmutables;

      // Skip if we don't have valid immutables
      if (!colImmutables) return;

      // Get decimal multiplier - default to 18 if not specified
      const decimalsMultiplier = Math.pow(
        10,
        parseInt(collTokenDecimals || "18", 10)
      );

      // Skip if we don't have valid data points
      if (
        !poolDataPoints ||
        !priceDataPoints ||
        poolDataPoints.length === 0 ||
        priceDataPoints.length === 0
      ) {
        return;
      }

      // Calculate TVL and ratio data
      const { tvlData, ratioData } = calculateTvlAndRatioData(
        poolDataPoints,
        priceDataPoints,
        decimalsMultiplier
      );

      // Get a fixed color for this trove manager
      const color = getColorForIndex(parseInt(troveManagerIndex));

      // Add this trove manager's TVL data as a series (if we have data)
      if (tvlData.length > 0) {
        crDaSeries.push(
          createChartSeries({
            name: `${symbol || "?"}`,
            type: "line",
            data: tvlData,
            color: color,
            yAxisIndex: 0, // Use left axis (USD) for TVL
            showInLegend: false,
          })
        );
      }

      // Add this trove manager's ratio data as a series (if we have data)
      if (ratioData.length > 0) {
        crDaSeries.push(
          createChartSeries({
            name: `${symbol || "?"}`,
            type: "line",
            data: ratioData,
            color: color,
            yAxisIndex: 1, // Use right axis for ratio
          })
        );
      }

      // Process price data for Oracle and SC prices
      if (priceDataPoints && priceDataPoints.length > 0) {
        const { oraclePriceData, priceFeedData } =
          calculatePriceData(priceDataPoints);

        // Add Oracle Price series
        if (oraclePriceData.length > 0) {
          pricesLiqsSeries.push(
            createChartSeries({
              name: "Oracle Price",
              type: "line",
              data: oraclePriceData,
              color: "#60a5fa", // Blue color for oracle price
              yAxisIndex: 1, // Use right axis for price
            })
          );
        }

        // Add SC Price series
        if (priceFeedData.length > 0) {
          pricesLiqsSeries.push(
            createChartSeries({
              name: "SC Price",
              type: "line",
              data: priceFeedData,
              color: "#4ade80", // Green color for SC price
              yAxisIndex: 1, // Use right axis for price
            })
          );
        }
      }

      // Process liquidation data for this trove manager
      if (eventData && Array.isArray(eventData)) {
        allLiquidationsData.push(...eventData);
      }
    }
  );

  // Calculate liquidation data for the whole protocol
  const liquidationData = calculateLiquidationData(allLiquidationsData);

  // Add liquidation series to chart data if we have data
  if (liquidationData.length > 0) {
    pricesLiqsSeries.push(
      createChartSeries({
        name: "Daily Liquidations",
        type: "bar",
        data: liquidationData,
        color: "#f87171", // Red color for liquidations
        yAxisIndex: 0, // Use left axis (USD)
        barWidth: 10, // Slim bars
      })
    );
  }

  // Return the chart data object with all chart types
  return {
    crDaData: {
      title: protocol.protocolInfo.displayName
        ? `${protocol.protocolInfo.displayName} CR/TVL`
        : "CR/TVL",
      series: crDaSeries,
      leftAxisName: "TVL (USD)",
      rightAxisName: "Ratio (%)",
    },
    pricesLiqsData: {
      title: protocol.protocolInfo.displayName
        ? `${protocol.protocolInfo.displayName} Prices/Liqs`
        : "Prices/Liqs",
      series: pricesLiqsSeries,
      leftAxisName: "Total Liqs (USD)",
      rightAxisName: "Price (USD)",
    },
  };
}

function generateTroveManagerChartData(protocol: any, chain: string) {
  // Object to store chart data for each trove manager
  const troveManagerCharts = {};

  // Process each trove manager's data
  Object.entries(protocol.chainData[chain].troveManagers).forEach(
    ([troveManagerIndex, troveManagerData]: [string, any]) => {
      const { poolDataPoints, priceDataPoints, colImmutables, eventData } =
        troveManagerData;
      const { collTokenSymbol: symbol, collTokenDecimals } = colImmutables;

      // Skip if we don't have valid immutables
      if (!colImmutables) return;

      // Get decimal multiplier - default to 18 if not specified
      const decimalsMultiplier = Math.pow(
        10,
        parseInt(collTokenDecimals || "18", 10)
      );

      // Skip if we don't have valid data
      if (
        !poolDataPoints ||
        !priceDataPoints ||
        poolDataPoints.length === 0 ||
        priceDataPoints.length === 0
      ) {
        return;
      }

      // Calculate TVL and ratio data
      const { tvlData, ratioData } = calculateTvlAndRatioData(
        poolDataPoints,
        priceDataPoints,
        decimalsMultiplier
      );

      const color = getColorForIndex(parseInt(troveManagerIndex));

      // Create the series array for CR/TVL chart
      const crDaSeries = [];

      // Add TVL series (if we have data)
      if (tvlData.length > 0) {
        crDaSeries.push(
          createChartSeries({
            name: `${symbol || "?"}`,
            type: "line",
            data: tvlData,
            color: color,
            yAxisIndex: 0, // Use left axis (USD) for TVL
            showInLegend: false,
          })
        );
      }

      // Add ratio series (if we have data)
      if (ratioData.length > 0) {
        crDaSeries.push(
          createChartSeries({
            name: `${symbol || "?"}`,
            type: "line",
            data: ratioData,
            color: color,
            yAxisIndex: 1, // Use right axis for ratio
          })
        );
      }

      // Calculate liquidation data for this specific trove manager
      const liquidationData = calculateLiquidationData(eventData);

      // Create the series array for Prices/Liqs chart
      const pricesLiqsSeries = [];

      // Process price data for Oracle and SC prices for this trove manager
      if (priceDataPoints && priceDataPoints.length > 0) {
        const { oraclePriceData, priceFeedData } =
          calculatePriceData(priceDataPoints);

        // Add Oracle Price series
        if (oraclePriceData.length > 0) {
          pricesLiqsSeries.push(
            createChartSeries({
              name: "Oracle Price",
              type: "line",
              data: oraclePriceData,
              color: "#60a5fa", // Blue color for oracle price
              yAxisIndex: 1, // Use right axis for price
            })
          );
        }

        // Add SC Price series
        if (priceFeedData.length > 0) {
          pricesLiqsSeries.push(
            createChartSeries({
              name: "SC Price",
              type: "line",
              data: priceFeedData,
              color: "#4ade80", // Green color for SC price
              yAxisIndex: 1, // Use right axis for price
            })
          );
        }
      }

      // Add liquidation series to chart data if we have data
      if (liquidationData.length > 0) {
        pricesLiqsSeries.push(
          createChartSeries({
            name: "Daily Liquidations",
            type: "bar",
            data: liquidationData,
            color: "#f87171", // Red color for liquidations
            yAxisIndex: 0,
            barWidth: 10,
          })
        );
      }

      // Initialize chart data for this trove manager
      troveManagerCharts[troveManagerIndex] = {};

      // Add CR/TVL chart if we have data
      if (crDaSeries.length > 0) {
        troveManagerCharts[troveManagerIndex].crDaData = {
          title: `${symbol || "TM-" + troveManagerIndex} CR/TVL`,
          series: crDaSeries,
          leftAxisName: "TVL (USD)",
          rightAxisName: "Ratio (%)",
        };
      }

      // Add Prices/Liqs chart if we have data
      if (pricesLiqsSeries.length > 0) {
        troveManagerCharts[troveManagerIndex].pricesLiqsData = {
          title: `${symbol || "TM-" + troveManagerIndex} Prices/Liqs`,
          series: pricesLiqsSeries,
          leftAxisName: "Total Liqs (USD)",
          rightAxisName: "Price (USD)",
        };
      }
    }
  );

  return troveManagerCharts;
}
