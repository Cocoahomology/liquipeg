"use client";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  useGetProtocolsOverviewData,
  formatProtocolDataForUI,
} from "@/app/api/protocols/client";
import { useState, useMemo, useEffect } from "react";
import { getRandomColor } from "~/utils";

// Interface for our formatted protocol data
interface FormattedProtocolData {
  id: string;
  name: string;
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
  prev7DayProtocolRedemptionTotal: number; // New field for protocol level redemption total
  troveManagers: {
    // Change from array to Record/object type
    [troveManagerIndex: number]: {
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
      currentColUSDOracle: string | number;
      prevDayColUSDOracle: string | number | null;
      prev7DayColUSDOracle: string | number | null;
      colUSDOracleChange1d: number | null;
      colUSDOracleChange7d: number | null;
      avgIR?: string | number;
      minIR?: string | number;
      maxLiqPrice?: string | number;
      prev7DayRedemptionTotal: number; // Keeps the trove manager level field
    };
  };
  displayName: string;
  iconLink: string;
  url: string;
  chartData?: any;
  troveManagerChartData?: any; // New field for trove manager chart data
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

function generateChartData(protocol: any, chain: string) {
  console.log("PROTOCOL FOR CHART DATA:", protocol, "Chain:", chain);

  // Initialize series array for our chart
  const crDaSeries = [];

  /*
  // Create a lookup to store total daily liquidations
  const dailyLiquidations = new Map<number, number>();

  // Process each trove manager's event data to collect liquidation data
  Object.entries(protocol.chainData[chain].troveManagers).forEach(
    ([troveManagerIndex, troveManagerData]: [string, any]) => {
      const { eventData } = troveManagerData;

      if (!eventData || !Array.isArray(eventData)) {
        return;
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
          dailyLiquidations.set(
            dayTimestamp,
            currentTotal + entryLiquidationSum
          );
        }
      });
    }
  )

  // Create liquidation data series if we have liquidation data
  if (dailyLiquidations.size > 0) {
    // Convert Map to array of data points, sorted by date
    const liquidationData = Array.from(dailyLiquidations.entries())
      .map(([timestamp, value]) => ({
        date: timestamp,
        value: value / 1e18, // Convert from wei to token units
      }))
      .sort((a, b) => a.date - b.date);

    // Add liquidation series to chart data
    crDaSeries.push({
      name: "Daily Liquidations",
      type: "bar",
      data: liquidationData,
      color: getRandomColor(), // Purple color for liquidations
      yAxisIndex: 0, // Use left axis (USD)
      barWidth: 10, // Slim bars
    });
  }
  */

  // Process each trove manager's data for collateral ratio
  Object.entries(protocol.chainData[chain].troveManagers).forEach(
    ([troveManagerIndex, troveManagerData]: [string, any]) => {
      const { poolDataPoints, priceDataPoints, colImmutables } =
        troveManagerData;
      const { collTokenSymbol: symbol, collTokenDecimals } = colImmutables;

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

        const tvl = (systemColl / decimalsMultiplier) * colPrice;
        tvlData.push({
          date: timestamp,
          value: tvl,
        });

        const normalizedColl =
          systemColl * (Math.pow(10, 18) / decimalsMultiplier);
        const ratio = ((normalizedColl * colPrice) / systemDebt) * 100;
        ratioData.push({
          date: timestamp,
          value: ratio,
        });
      });

      // Get a fixed color for this trove manager
      const color = getColorForIndex(parseInt(troveManagerIndex));

      // Add this trove manager's TVL data as a series (if we have data)
      if (tvlData.length > 0) {
        crDaSeries.push({
          name: `${symbol || "?"}`,
          type: "line",
          data: tvlData,
          color: color,
          yAxisIndex: 0, // Use left axis (USD) for TVL
          showInLegend: false,
        });
      }

      // Add this trove manager's ratio data as a series (if we have data)
      if (ratioData.length > 0) {
        crDaSeries.push({
          name: `${symbol || "?"}`,
          type: "line",
          data: ratioData,
          color: color,
          yAxisIndex: 1, // Use right axis for ratio
        });
      }
    }
  );

  // Return the chart data object
  return {
    tvlHistory: [10000000, 12000000, 15000000, 13000000, 16000000, 50000000],
    crDaData: {
      title: protocol.protocolInfo.displayName
        ? `${protocol.protocolInfo.displayName} CR/TVL`
        : "CR/TVL",
      series: crDaSeries,
      leftAxisName: "TVL (USD)",
      rightAxisName: "Ratio (%)",
    },
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

function generateTroveManagerChartData(protocol: any, chain: string) {
  // Object to store chart data for each trove manager
  const troveManagerCharts = {};

  // Process each trove manager's data for collateral ratio
  Object.entries(protocol.chainData[chain].troveManagers).forEach(
    ([troveManagerIndex, troveManagerData]: [string, any]) => {
      const { poolDataPoints, priceDataPoints, colImmutables } =
        troveManagerData;
      const { collTokenSymbol: symbol, collTokenDecimals } = colImmutables;

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

        // Calculate TVL (systemColl * colPrice with proper decimals)
        const tvl = (systemColl / decimalsMultiplier) * colPrice;
        tvlData.push({
          date: timestamp,
          value: tvl,
        });

        // Calculate ratio (convert to percentage)
        const normalizedColl =
          systemColl * (Math.pow(10, 18) / decimalsMultiplier);
        const ratio = ((normalizedColl * colPrice) / systemDebt) * 100;
        ratioData.push({
          date: timestamp,
          value: ratio,
        });
      });

      const color1 = getColorForIndex(parseInt(troveManagerIndex));
      const color2 = getColorForIndex(parseInt(troveManagerIndex + 1));

      // Create the series array
      const series = [];

      // Add TVL series (if we have data)
      if (tvlData.length > 0) {
        series.push({
          name: `${symbol || "?"}`,
          type: "line",
          data: tvlData,
          color: color1,
          yAxisIndex: 0, // Use left axis (USD) for TVL
          showInLegend: false,
        });
      }

      // Add ratio series (if we have data)
      if (ratioData.length > 0) {
        series.push({
          name: `${symbol || "?"}`,
          type: "line",
          data: ratioData,
          color: color2,
          yAxisIndex: 1, // Use right axis for ratio
        });
      }

      // Create chart data for this trove manager if we have data
      if (series.length > 0) {
        troveManagerCharts[troveManagerIndex] = {
          crDaData: {
            title: `${symbol || "TM-" + troveManagerIndex} CR/TVL`,
            series: series,
            leftAxisName: "TVL (USD)",
            rightAxisName: "Ratio (%)",
          },
        };
      }
    }
  );

  return troveManagerCharts;
}

interface ProtocolsPageProps {
  changePeriod: string;
}

export function ProtocolsPage({ changePeriod = "1d" }: ProtocolsPageProps) {
  const {
    data: protocolsData = [],
    isLoading,
    error,
  } = useGetProtocolsOverviewData();

  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(
    null
  );
  const [selectedTroveManagerIndex, setSelectedTroveManagerIndex] = useState<
    number | null
  >(null);

  // Format protocol data for UI
  const formattedData = useMemo(() => {
    if (!protocolsData) return [];

    const formatted = formatProtocolDataForUI(protocolsData);

    // Attach chart data to each formatted protocol
    return formatted.map((protocol) => {
      // Extract protocol ID and chain from the compound ID (format: "id-chain")
      const [protocolId, chain] = protocol.id.split("-");

      // Check if protocolsData is an array or an object with keys
      const rawProtocol = Array.isArray(protocolsData)
        ? protocolsData.find((p) => p.id === protocolId)
        : protocolsData[protocolId];

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
  }, [protocolsData]);

  // Auto-select the first protocol when data is loaded
  useEffect(() => {
    if (!selectedProtocolId && formattedData.length > 0) {
      const firstProtocol = formattedData[0];
      setSelectedProtocolId(firstProtocol.id);
      console.log(
        `Auto-selected first protocol: ${firstProtocol.id}, ${firstProtocol.name}`
      );
    }
  }, [formattedData, selectedProtocolId]);

  // Get chart data for selected protocol or trove manager
  const selectedChartData = useMemo(() => {
    // Always provide default data if nothing is selected
    const defaultChartData = {
      tvlHistory: [10000000, 12000000, 15000000, 13000000, 16000000, 20000000],
    };

    console.log("selectedProtocolId:", selectedProtocolId);
    console.log("selectedTroveManagerIndex:", selectedTroveManagerIndex);
    console.log("formattedData length:", formattedData?.length);

    if (!selectedProtocolId || !formattedData?.length) {
      console.log("Using default chart data");
      return defaultChartData;
    }

    const selectedProtocol = formattedData.find(
      (p) => p.id === selectedProtocolId
    );
    console.log(
      "Selected protocol:",
      selectedProtocol?.id,
      selectedProtocol?.name
    );

    // If a trove manager index is selected and exists in the troveManagerChartData
    if (
      selectedTroveManagerIndex !== null &&
      selectedProtocol?.troveManagerChartData
    ) {
      const troveManagerData =
        selectedProtocol.troveManagerChartData[selectedTroveManagerIndex];
      if (troveManagerData) {
        console.log(
          `Found chart data for trove manager index ${selectedTroveManagerIndex}:`,
          troveManagerData
        );
        return troveManagerData;
      } else {
        console.log(
          `No chart data found for trove manager index ${selectedTroveManagerIndex}, using protocol data`
        );
      }
    }

    // Use protocol level data if no trove manager is selected or if trove manager data not found
    if (selectedProtocol?.chartData) {
      console.log(
        "Using protocol level chart data:",
        selectedProtocol.chartData
      );
      return selectedProtocol.chartData;
    } else {
      console.log("No chart data found for selected protocol, using default");
      return defaultChartData;
    }
  }, [selectedProtocolId, selectedTroveManagerIndex, formattedData]);

  // Log what we're passing to DashboardLayout
  console.log("Passing to DashboardLayout:", selectedChartData);

  // Handler for when a protocol is selected in the table
  const handleSelectItem = (item: any) => {
    setSelectedProtocolId(item.id);
    setSelectedTroveManagerIndex(item.index !== undefined ? item.index : null);
    console.log(
      `Selected protocol ID: ${item.id}, trove manager index: ${
        item.index !== undefined ? item.index : "none"
      }`
    );
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error loading protocols data</div>;
  }

  return (
    <div>
      <div className="mb-4"></div>
      <DashboardLayout
        data={formattedData}
        customTitle="Protocol Analytics"
        changePeriod={changePeriod}
        onSelectItem={handleSelectItem}
        selectedItemChartData={selectedChartData}
        selectedTroveManagerIndex={selectedTroveManagerIndex}
      />
    </div>
  );
}
