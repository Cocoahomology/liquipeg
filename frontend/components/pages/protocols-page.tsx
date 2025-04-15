"use client";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  useGetProtocolsOverviewData,
  formatProtocolDataForUI,
} from "@/app/api/protocols/client";
import { useState, useMemo, useEffect } from "react";

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

interface ProtocolsPageProps {
  changePeriod: "none" | "1d" | "7d" | "30d";
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

    return formatProtocolDataForUI(protocolsData as any, selectedProtocolId);
  }, [protocolsData, selectedProtocolId]);

  // Auto-select the first protocol when data is loaded
  useEffect(() => {
    if (!selectedProtocolId && formattedData.length > 0) {
      const firstProtocol = formattedData[0];
      setSelectedProtocolId(firstProtocol.id);
    }
  }, [formattedData, selectedProtocolId]);

  // Get chart data for selected protocol or trove manager
  const selectedChartData = useMemo(() => {
    console.log("selectedProtocolId:", selectedProtocolId);
    console.log("selectedTroveManagerIndex:", selectedTroveManagerIndex);
    console.log("formattedData length:", formattedData?.length);
    console.log("FORMATTED DATA", formattedData);

    if (!selectedProtocolId || !formattedData?.length) {
      return {};
    }

    const selectedProtocol = formattedData.find(
      (p) => p.id === selectedProtocolId
    );

    // If a trove manager index is selected and exists in the troveManagerChartData
    if (
      selectedTroveManagerIndex !== null &&
      selectedProtocol?.troveManagerChartData
    ) {
      const troveManagerData =
        selectedProtocol.troveManagerChartData[selectedTroveManagerIndex];
      if (troveManagerData) {
        return troveManagerData;
      } else {
      }
    }

    // Use protocol level data if no trove manager is selected or if trove manager data not found
    if (selectedProtocol?.chartData) {
      return selectedProtocol.chartData;
    } else {
      return {};
    }
  }, [selectedProtocolId, selectedTroveManagerIndex, formattedData]);

  // Get liquidation events for display in the table chart
  const liquidationEventsToShow = useMemo(() => {
    if (!selectedProtocolId || !formattedData?.length) {
      return [];
    }

    const selectedProtocol = formattedData.find(
      (p) => p.id === selectedProtocolId
    );

    if (!selectedProtocol) return [];

    // If a trove manager is selected, show only its liquidation events
    if (selectedTroveManagerIndex !== null) {
      const selectedTroveManager = selectedProtocol.troveManagers.find(
        (tm) => tm.index === selectedTroveManagerIndex
      );

      if (!selectedTroveManager) return [];

      // Add the collateralSymbol to each event if it's missing
      return selectedTroveManager.liquidationEvents.map((event) => ({
        ...event,
        collateralSymbol: selectedTroveManager.collateralSymbol,
      }));
    }

    // Otherwise, show all liquidation events for the protocol
    return selectedProtocol.liquidationEvents || [];
  }, [selectedProtocolId, selectedTroveManagerIndex, formattedData]);

  // Similar function for redemption events
  const redemptionEventsToShow = useMemo(() => {
    if (!selectedProtocolId || !formattedData?.length) {
      return [];
    }

    const selectedProtocol = formattedData.find(
      (p) => p.id === selectedProtocolId
    );

    if (!selectedProtocol) return [];

    // If a trove manager is selected, show only its redemption events
    if (selectedTroveManagerIndex !== null) {
      const selectedTroveManager = selectedProtocol.troveManagers.find(
        (tm) => tm.index === selectedTroveManagerIndex
      );

      if (!selectedTroveManager) return [];

      // Add the collateralSymbol to each event if it's missing
      return selectedTroveManager.redemptionEvents.map((event) => ({
        ...event,
        collateralSymbol: selectedTroveManager.collateralSymbol,
      }));
    }

    // Otherwise, show all redemption events for the protocol
    return selectedProtocol.redemptionEvents || [];
  }, [selectedProtocolId, selectedTroveManagerIndex, formattedData]);

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
        customTitle="Analytics"
        changePeriod={changePeriod}
        onSelectItem={handleSelectItem}
        selectedItemChartData={selectedChartData}
        selectedTroveManagerIndex={selectedTroveManagerIndex}
        liquidationEvents={liquidationEventsToShow}
        redemptionEvents={redemptionEventsToShow}
      />
    </div>
  );
}
