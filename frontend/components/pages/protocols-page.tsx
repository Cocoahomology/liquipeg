"use client";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  useGetProtocolsOverviewData,
  formatProtocolDataForUI,
} from "@/app/api/protocols/client";
import { useState, useMemo } from "react";

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

function generateChartData(protocol: any) {
  return {
    // Example chart data structure with more obvious values for testing
    tvlHistory: [10000000, 12000000, 15000000, 13000000, 16000000, 50000000],
    // Add any other chart data processing here
  };
}

function generateTroveManagerChartData(protocol: any) {
  return {
    // Example trove manager chart data with different values than protocol chart data
    "0": {
      tvlHistory: [1800, 1850, 1900, 1750, 1700, 1900],
      crHistory: [1, 3, 6],
    },
    "1": {
      tvlHistory: [1200, 1850, 1900, 1750, 1000, 1800],
      crHistory: [5, 3, 8],
    },
    "2": {
      tvlHistory: [800, 1850, 2500, 1750, 1700, 2500],
      crHistory: [1, 2, 9],
    },
  };
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
      // Extract protocol ID from the compound ID (format: "id-chain")
      const [protocolId] = protocol.id.split("-");

      // Check if protocolsData is an array or an object with keys
      const rawProtocol = Array.isArray(protocolsData)
        ? protocolsData.find((p) => p.id === protocolId)
        : protocolsData[protocolId];

      return {
        ...protocol,
        chartData: rawProtocol ? generateChartData(rawProtocol) : undefined,
        troveManagerChartData: rawProtocol
          ? generateTroveManagerChartData(rawProtocol)
          : undefined,
      };
    });
  }, [protocolsData]);

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
