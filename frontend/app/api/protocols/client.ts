import { fetchApi } from "~/utils/async";
import { getProtocolsOverviewPageData } from ".";
import { useQuery } from "@tanstack/react-query";

// Define types for the input data structure
interface ColImmutables {
  CCR: string;
  SCR: string;
  MCR: string;
  troveManager: string;
  collToken: string;
  collTokenSymbol: string;
  collTokenDecimals: string;
  activePool: string;
  defaultPool: string;
  stabilityPool: string;
  borrowerOperationsAddress: string;
  sortedTroves: string;
  troveNFT: string;
  priceFeed: string;
  isLST: boolean | null;
  LSTunderlying: string | null;
  collAlternativeChainAddresses: string[] | null;
}

interface TroveData {
  troveId: string;
  arrayIndex: number;
  lastDebtUpdateTime: string;
  lastInterestRateAdjTime: string;
  annualInterestRate: string;
  interestBatchManager: string;
  batchDebtShares: string;
  ownerAddress: string;
  debt: string;
  coll: string;
  stake: string;
  status: number;
  entire_debt: string;
  accrued_interest: string;
}

interface PoolDataPoint {
  date: string;
  timestamp: number;
  blockNumber: number;
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
  [key: string]: any;
}

interface PriceDataPoint {
  date: string;
  timestamp: number;
  blockNumber: number;
  colUSDPriceFeed: string;
  colUSDOracle: string;
  LSTUnderlyingCanonicalRate?: string;
  LSTUnderlyingMarketRate?: string;
  underlyingUSDOracle?: string;
  deviation?: string;
  redemptionRelatedOracles?: Record<string, number>;
  [key: string]: any;
}

interface EventData {
  blockNumber: number;
  timestamp: number;
  events: Array<{
    chain: string;
    protocolId: number;
    txHash: string;
    troveManagerIndex: number;
    operation: number;
    eventName: string;
    eventData: {
      troveId: string;
      operation: string;
      annualInterestRate: string;
      collIncreaseFromRedist: string;
      debtIncreaseFromRedist: string;
      collChangeFromOperation: string;
      debtChangeFromOperation: string;
      debtIncreaseFromUpfrontFee: string;
    };
  }>;
}

interface TroveManager {
  troveManagerIndex: number;
  poolDataPoints: PoolDataPoint[];
  priceDataPoints: PriceDataPoint[];
  colImmutables: ColImmutables;
  troveData: TroveData[];
  eventData: EventData[];
  prev7DayRedemptionTotal?: string;
  currentDebtBold?: string;
  currentColUSD?: string;
  currentSpBold?: string;
  currentSpColUsd?: string;
  colRatio?: string;
  currentColUSDOracle?: string;
  currentColUSDPriceFeed?: string;
  prevDayDebtBold?: string;
  prevDayColUSD?: string;
  prevDaySpBold?: string;
  prevDaySpColUsd?: string;
  prevDayColRatio?: string;
  prev7DayDebtBold?: string;
  prev7DayColUSD?: string;
  prev7DaySpBold?: string;
  prev7DaySpColUsd?: string;
  prev7DayColRatio?: string;
  prevDayColUSDOracle?: string;
  prev7DayColUSDOracle?: string;
  tvlChange1d?: number;
  tvlChange7d?: number;
  collateralRatioChange1d?: number;
  collateralRatioChange7d?: number;
  colUSDOracleChange1d?: number;
  colUSDOracleChange7d?: number;
  avgIR?: string;
  minIR?: string;
  maxLiqPrice?: string;
}

interface ChainData {
  troveManagers: Record<string, TroveManager>;
  prevDayProtocolTvl?: string | null;
  prevDayProtocolColRatio?: string | null;
  prevDayProtocolDebtBold?: string | null;
  prevDayProtocolSpTvl?: string | null;
  prev7DayProtocolTvl?: string | null;
  prev7DayProtocolColRatio?: string | null;
  prev7DayProtocolDebtBold?: string | null;
  prev7DayProtocolSpTvl?: string | null;
  prev7DayProtocolRedemptionTotal?: string;
  tvlChange1d?: number | null;
  colRatioChange1d?: number | null;
  debtBoldChange1d?: number | null;
  spTvlChange1d?: number | null;
  tvlChange7d?: number | null;
  colRatioChange7d?: number | null;
  debtBoldChange7d?: number | null;
  spTvlChange7d?: number | null;
  currentProtocolTvl?: string;
  currentProtocolColRatio?: string | null;
  currentProtocolDebtBold?: string;
  currentProtocolSpTvl?: string;
}

interface ProtocolInfo {
  protocolId: number;
  name: string;
  chains: string[];
  immutables: Record<
    string,
    {
      boldToken: string;
      collateralRegistry: string;
      interestRouter: string;
    }
  >;
  displayName: string;
  iconLink: string;
  url: string;
}

interface ProtocolData {
  protocolInfo: ProtocolInfo;
  chainData: Record<string, ChainData>;
}

interface RawProtocolsData {
  [protocolId: string]: ProtocolData;
}

// Define the output types for clarity
interface FormattedTroveManager {
  id: string;
  index: number;
  collateralSymbol: string;
  tvl: number;
  prevDayTvl: number | null;
  prev7DayTvl: number | null;
  tvlChange1d: number | null;
  tvlChange7d: number | null;
  collateralRatio: number;
  prevDayCollateralRatio: number | null;
  prev7DayCollateralRatio: number | null;
  collateralRatioChange1d: number | null;
  collateralRatioChange7d: number | null;
  ratioSettings: string;
  ccr: number;
  currentColUSDOracle: string;
  prevDayColUSDOracle: string | null;
  prev7DayColUSDOracle: string | null;
  colUSDOracleChange1d: number | null;
  colUSDOracleChange7d: number | null;
  avgIR: string;
  minIR: string;
  maxLiqPrice: string;
  prev7DayRedemptionTotal: number;
  liquidationEvents: Array<{
    timestamp: number;
    date: string;
    chain: string;
    txHash: string;
    debtChange: number;
  }>;
  redemptionEvents: Array<{
    timestamp: number;
    date: string;
    chain: string;
    txHash: string;
    debtChange: number;
  }>;
}

interface ChartData {
  title: string;
  series: any[];
  leftAxisName: string;
  rightAxisName: string;
}

interface FormattedProtocol {
  id: string;
  name: string;
  displayName: string;
  chain: string;
  tvl: number;
  tvlChange1d: number | null;
  tvlChange7d: number | null;
  collateralRatio: number;
  collateralRatioChange1d: number | null;
  collateralRatioChange7d: number | null;
  stableDebt: number;
  stableDebtChange1d: number | null;
  stableDebtChange7d: number | null;
  spTvl: number;
  spTvlChange1d: number | null;
  spTvlChange7d: number | null;
  prev7DayProtocolRedemptionTotal: number;
  iconLink: string;
  url: string;
  troveManagers: FormattedTroveManager[];
  chartData?: {
    crDaData: ChartData;
    pricesLiqsData: ChartData;
  };
  troveManagerChartData?: Record<
    string,
    {
      crDaData?: ChartData;
      lstDetailsData?: ChartData;
      pricesLiqsData?: ChartData;
    }
  >;
  liquidationEvents: Array<{
    timestamp: number;
    date: string;
    chain: string;
    txHash: string;
    debtChange: number;
    troveManagerIndex: number;
    collateralSymbol: string;
  }>;
  redemptionEvents: Array<{
    timestamp: number;
    date: string;
    chain: string;
    txHash: string;
    debtChange: number;
    troveManagerIndex: number;
    collateralSymbol: string;
  }>;
}

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
export const formatProtocolDataForUI = (
  data: RawProtocolsData,
  selectedProtocolId?: string | null
): FormattedProtocol[] => {
  if (!data) return [];

  const formatted: FormattedProtocol[] = [];

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

      // Create a composite id for this protocol-chain combination
      const compositeId = `${protocolId}-${chain}`;

      // Arrays to store protocol-level liquidation and redemption events
      const protocolLiquidationEvents = [];
      const protocolRedemptionEvents = [];

      // Format trove managers first to collect all events
      const formattedTroveManagers = chainInfo.troveManagers
        ? (Object.values(chainInfo.troveManagers)
            .map((tm) => formatTroveManagerForUI(tm, protocolId, chain))
            .filter(Boolean) as FormattedTroveManager[])
        : [];

      // Collect all liquidation and redemption events from trove managers
      // and add collateral symbol information to each event
      formattedTroveManagers.forEach((tm) => {
        if (tm.liquidationEvents && tm.liquidationEvents.length > 0) {
          // Add trove manager index and collateral symbol to each event
          const liquidationEventsWithTM = tm.liquidationEvents.map((event) => ({
            ...event,
            troveManagerIndex: tm.index,
            collateralSymbol: tm.collateralSymbol,
          }));
          protocolLiquidationEvents.push(...liquidationEventsWithTM);
        }

        if (tm.redemptionEvents && tm.redemptionEvents.length > 0) {
          // Add trove manager index and collateral symbol to each event
          const redemptionEventsWithTM = tm.redemptionEvents.map((event) => ({
            ...event,
            troveManagerIndex: tm.index,
            collateralSymbol: tm.collateralSymbol,
          }));
          protocolRedemptionEvents.push(...redemptionEventsWithTM);
        }
      });

      // Sort protocol-level events by timestamp in descending order (newest first)
      protocolLiquidationEvents.sort((a, b) => b.timestamp - a.timestamp);
      protocolRedemptionEvents.sort((a, b) => b.timestamp - a.timestamp);

      // Create formatted protocol object with only the essential data needed for the UI
      const formattedProtocol: FormattedProtocol = {
        id: compositeId,
        name: protocolInfo.displayName || protocolInfo.name,
        displayName: protocolInfo.name,
        chain: chain,
        tvl: parseFloat(chainInfo.currentProtocolTvl || "0"),
        tvlChange1d: chainInfo.tvlChange1d
          ? parseFloat(String(chainInfo.tvlChange1d))
          : null,
        tvlChange7d: chainInfo.tvlChange7d
          ? parseFloat(String(chainInfo.tvlChange7d))
          : null,
        collateralRatio:
          parseFloat(chainInfo.currentProtocolColRatio || "0") * 100,
        collateralRatioChange1d: chainInfo.colRatioChange1d
          ? parseFloat(String(chainInfo.colRatioChange1d))
          : null,
        collateralRatioChange7d: chainInfo.colRatioChange7d
          ? parseFloat(String(chainInfo.colRatioChange7d))
          : null,
        stableDebt: parseFloat(chainInfo.currentProtocolDebtBold || "0"),
        stableDebtChange1d: chainInfo.debtBoldChange1d
          ? parseFloat(String(chainInfo.debtBoldChange1d))
          : null,
        stableDebtChange7d: chainInfo.debtBoldChange7d
          ? parseFloat(String(chainInfo.debtBoldChange7d))
          : null,
        spTvl: parseFloat(chainInfo.currentProtocolSpTvl || "0"),
        spTvlChange1d: chainInfo.spTvlChange1d
          ? parseFloat(String(chainInfo.spTvlChange1d))
          : null,
        spTvlChange7d: chainInfo.spTvlChange7d
          ? parseFloat(String(chainInfo.spTvlChange7d))
          : null,
        prev7DayProtocolRedemptionTotal: prev7DayProtocolRedemptionTotal,
        iconLink: protocolInfo.iconLink || "",
        url: protocolInfo.url || "",
        troveManagers: formattedTroveManagers,
        liquidationEvents: protocolLiquidationEvents,
        redemptionEvents: protocolRedemptionEvents,
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

  // Now add chart data only for the selected protocol (if specified)
  return formatted.map((protocol) => {
    // Extract protocol ID and chain from the compound ID (format: "id-chain")
    const [protocolId, chain] = protocol.id.split("-");

    // Only add chart data if this is the selected protocol or no selection has been made
    const shouldGenerateChartData =
      !selectedProtocolId || protocol.id === selectedProtocolId;

    // Check if protocolsData is an array or an object with keys
    const rawProtocol = Array.isArray(data)
      ? data.find((p) => p.id === protocolId)
      : data[protocolId];

    return {
      ...protocol,
      // Only generate chart data for the selected protocol to save memory
      chartData:
        shouldGenerateChartData && rawProtocol
          ? generateChartData(rawProtocol, chain)
          : undefined,
      troveManagerChartData:
        shouldGenerateChartData && rawProtocol
          ? generateTroveManagerChartData(rawProtocol, chain)
          : undefined,
    };
  });
};

// Extract trove manager formatting to a separate function
function formatTroveManagerForUI(
  tm: TroveManager,
  protocolId: string,
  chain: string
): FormattedTroveManager | null {
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

  // Process event data to extract liquidation and redemption events
  const liquidationEvents: Array<{
    timestamp: number;
    date: string;
    chain: string;
    txHash: string;
    debtChange: number;
  }> = [];

  const redemptionEvents: Array<{
    timestamp: number;
    date: string;
    chain: string;
    txHash: string;
    debtChange: number;
  }> = [];

  // Check if eventData is an array and process it
  if (tm.eventData && Array.isArray(tm.eventData)) {
    tm.eventData.forEach((eventEntry) => {
      if (eventEntry.events && Array.isArray(eventEntry.events)) {
        const timestamp = eventEntry.timestamp;
        // Convert timestamp to date string (YYYY-MM-DD format)
        const date = new Date(timestamp * 1000).toISOString().split("T")[0];

        eventEntry.events.forEach((event) => {
          // For liquidation events (operation = 5)
          if (event.operation === 5) {
            const debtChangeValue =
              parseFloat(event.eventData?.debtChangeFromOperation || "0") /
              1e18;

            liquidationEvents.push({
              timestamp,
              date,
              chain: event.chain,
              txHash: event.txHash,
              debtChange: debtChangeValue,
            });
          }

          // For redemption events (operation = 6)
          if (event.operation === 6) {
            const debtChangeValue =
              parseFloat(event.eventData?.debtChangeFromOperation || "0") /
              1e18;

            redemptionEvents.push({
              timestamp,
              date,
              chain: event.chain,
              txHash: event.txHash,
              debtChange: debtChangeValue,
            });
          }
        });
      }
    });
  }

  liquidationEvents.sort((a, b) => b.timestamp - a.timestamp);
  redemptionEvents.sort((a, b) => b.timestamp - a.timestamp);

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
    liquidationEvents, // Add the new sorted array
    redemptionEvents, // Add the new sorted array
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
  decimalsMultiplier: number,
  isLST: boolean
) {
  // Create a lookup table for price data based on timestamp
  const priceByTimestamp = {};
  priceDataPoints.forEach((point) => {
    priceByTimestamp[point.timestamp] = point;
  });

  // Arrays to store both CR and TVL data points
  const ratioData = [];
  const tvlData = [];
  // New arrays for LST data series
  const lstMarketRateData = [];
  const lstCanonicalRateData = [];
  const lstDeviationData = [];

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

    // Compute LST data if isLST is true, else leave arrays empty
    if (isLST) {
      if (pricePoint.LSTUnderlyingMarketRate !== undefined) {
        lstMarketRateData.push({
          date: timestamp,
          value: parseFloat(pricePoint.LSTUnderlyingMarketRate),
        });
      }
      if (pricePoint.LSTUnderlyingCanonicalRate !== undefined) {
        lstCanonicalRateData.push({
          date: timestamp,
          value: parseFloat(pricePoint.LSTUnderlyingCanonicalRate),
        });
      }
      if (pricePoint.deviation !== undefined) {
        lstDeviationData.push({
          date: timestamp,
          value: parseFloat(pricePoint.deviation),
        });
      }
    }
  });

  return {
    tvlData,
    ratioData,
    lstMarketRateData: isLST ? lstMarketRateData : [],
    lstCanonicalRateData: isLST ? lstCanonicalRateData : [],
    lstDeviationData: isLST ? lstDeviationData : [],
  };
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

      if (!colImmutables) return;
      const { collTokenSymbol: symbol, collTokenDecimals } = colImmutables;
      // Get isLST flag (default false)
      const isLST = colImmutables.isLST || false;
      const decimalsMultiplier = Math.pow(
        10,
        parseInt(collTokenDecimals || "18", 10)
      );
      if (
        !poolDataPoints ||
        !priceDataPoints ||
        poolDataPoints.length === 0 ||
        priceDataPoints.length === 0
      ) {
        return;
      }

      const { tvlData, ratioData } = calculateTvlAndRatioData(
        poolDataPoints,
        priceDataPoints,
        decimalsMultiplier,
        isLST
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

      // Skip if we don't have valid immutables
      if (!colImmutables) return;

      const {
        collTokenSymbol: symbol,
        collTokenDecimals,
        isLST,
      } = colImmutables;

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
      const {
        tvlData,
        ratioData,
        lstMarketRateData,
        lstCanonicalRateData,
        lstDeviationData,
      } = calculateTvlAndRatioData(
        poolDataPoints,
        priceDataPoints,
        decimalsMultiplier,
        isLST
      );

      const color = getColorForIndex(parseInt(troveManagerIndex));
      const color2 = getColorForIndex(parseInt(troveManagerIndex) + 1);
      const color3 = getColorForIndex(parseInt(troveManagerIndex) + 2);

      // Create the series array for CR/TVL chart
      const crDaSeries = [];
      const lstDetailsSeries = [];

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

      if (lstMarketRateData.length > 0) {
        lstDetailsSeries.push(
          createChartSeries({
            name: `Market Rate`,
            type: "line",
            data: lstMarketRateData,
            color: color,
            yAxisIndex: 1,
          })
        );
      }

      if (lstCanonicalRateData.length > 0) {
        lstDetailsSeries.push(
          createChartSeries({
            name: `Canonical Rate`,
            type: "line",
            data: lstCanonicalRateData,
            color: color2,
            yAxisIndex: 1,
          })
        );
      }

      if (lstDeviationData.length > 0) {
        lstDetailsSeries.push(
          createChartSeries({
            name: `deviation`,
            type: "line",
            data: lstDeviationData,
            color: color3,
            yAxisIndex: 0,
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

      // Add LST Details chart if we have data
      if (lstDetailsSeries.length > 0) {
        troveManagerCharts[troveManagerIndex].lstDetailsData = {
          title: `${symbol || "TM-" + troveManagerIndex} LST Details`,
          series: lstDetailsSeries,
          leftAxisName: "deviation (%)",
          rightAxisName: "Rates",
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
