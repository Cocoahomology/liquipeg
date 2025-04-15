"use client";

import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { useGetTrovesData } from "@/app/api/troves/client";
import { CollateralFilter } from "@/components/collateral-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProtocolCombobox } from "@/components/protocol-combobox";
import { useGetProtocols, formatTroveDataForUI } from "@/app/api/troves/client";

// Custom component to render in the charts panel
const CollateralCards = ({
  formattedData,
  selectedCollateralIds,
}: {
  formattedData: any;
  selectedCollateralIds: string[];
}) => {
  // Find the selected trove managers from formattedData based on selectedCollateralIds
  const selectedTroveManagers = useMemo(() => {
    if (!formattedData || !formattedData.troveManagers) return [];

    return formattedData.troveManagers.filter((tm) =>
      selectedCollateralIds.includes(`${formattedData.chain}:${tm.index}`)
    );
  }, [formattedData, selectedCollateralIds]);

  return (
    <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 p-4">
      {selectedTroveManagers.map((tm) => (
        <Card key={tm.id} className="w-full">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xl">{tm.collateralSymbol}</CardTitle>
            <span className="text-sm text-muted-foreground">
              {tm.troveCount === 1 ? "1 trove" : `${tm.troveCount} troves`}
            </span>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Collateral:
                </span>
                <span className="font-medium">
                  {tm.currentCol ? parseFloat(tm.currentCol).toFixed(2) : "0"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Total Debt:
                </span>
                <span className="font-medium">
                  $
                  {tm.currentDebtBold
                    ? new Intl.NumberFormat("en-US", {
                        notation: "compact",
                        maximumFractionDigits: 2,
                      }).format(parseFloat(tm.currentDebtBold))
                    : "0"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">CR:</span>
                <span className="font-medium">
                  {tm.colRatio
                    ? parseFloat(String(tm.colRatio)).toFixed(0)
                    : "0"}
                  %
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Price:</span>
                <span className="font-medium">
                  $
                  {tm.currentColUSDPriceFeed
                    ? parseFloat(
                        String(tm.currentColUSDPriceFeed)
                      ).toLocaleString(undefined, { maximumFractionDigits: 2 })
                    : "0"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">MCR:</span>
                <span className="font-medium">{tm.mcr ? tm.mcr : "0"}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export function TrovesPage() {
  const { data: protocolData = [], isLoading: isLoadingProtocols } =
    useGetProtocols();
  // Extract protocol names for the combobox
  const protocols = useMemo(
    () => protocolData.map((protocol) => protocol.displayName),
    [protocolData]
  );
  // Changed to null initial value instead of "Aave"
  const [selectedProtocol, setSelectedProtocol] = useState<string | null>(null);
  // Update to use composite key (chain:troveManagerIndex) for collaterals
  interface CollateralIdentifier {
    chain: string;
    troveManagerIndex: number;
  }
  // Use a structure that preserves both chain and troveManagerIndex
  const [selectedCollaterals, setSelectedCollaterals] = useState<
    CollateralIdentifier[]
  >([]);

  // Define the Protocol interface that's used in selectedProtocolInfo
  interface Protocol {
    displayName: string;
    protocolId: number;
    chains: string[];
    immutables?: {
      [chain: string]: {
        troveManagers?: Array<{
          troveManagerIndex: number;
          colImmutables: {
            collTokenSymbol: string;
          };
        }>;
      };
    };
  }

  // Get the selected protocol object
  const selectedProtocolInfo = useMemo(() => {
    if (!selectedProtocol) return null;
    console.log("Selected protocol:", selectedProtocol);
    console.log("Protocol data:", protocolData);
    return Object.values(protocolData).find(
      (p: any) => p.displayName === selectedProtocol
    ) as Protocol | null;
  }, [selectedProtocol, protocolData]);

  // Use the hook at the top level with the selected protocol info
  const { data: trovesData, isLoading: isLoadingTroves } =
    useGetTrovesData(selectedProtocolInfo);

  // Format troves data for UI
  const formattedData = useMemo(() => {
    if (!trovesData) return null;

    try {
      const formatted = formatTroveDataForUI(trovesData);
      console.log("FINAL FORMATTED TROVES DATA", formatted);
      return formatted;
    } catch (error) {
      console.error("Error formatting troves data:", error);
      return null;
    }
  }, [trovesData]);

  // Reset selected collaterals when protocol changes
  useEffect(() => {
    setSelectedCollaterals([]);
  }, [selectedProtocol]);

  const availableCollaterals = useMemo(() => {
    if (!selectedProtocolInfo) return [];
    const collaterals: {
      id: string; // Composite key as string for easy comparison
      chain: string;
      troveManagerIndex: number;
      name: string;
    }[] = [];
    // Get the chains from the selected protocol
    const protocolChains = selectedProtocolInfo.chains || [];
    // For each chain, extract collaterals from troveManagers
    protocolChains.forEach((chain) => {
      const chainImmutables = selectedProtocolInfo.immutables?.[chain];
      if (chainImmutables?.troveManagers) {
        chainImmutables.troveManagers.forEach((tm) => {
          collaterals.push({
            id: `${chain}:${tm.troveManagerIndex}`, // Composite key as string
            chain,
            troveManagerIndex: tm.troveManagerIndex,
            name: tm.colImmutables.collTokenSymbol,
          });
        });
      }
    });
    return collaterals;
  }, [selectedProtocolInfo]);

  const filteredTroves = useMemo(() => {
    if (!formattedData || !selectedProtocol || selectedCollaterals.length === 0)
      return [];

    // Get all trove data for selected collaterals
    const allTroves = [];

    // For each selected collateral, find the matching trove manager and extract its trove data
    selectedCollaterals.forEach((selected) => {
      const troveManager = formattedData.troveManagers.find(
        (tm) =>
          tm.index === selected.troveManagerIndex &&
          formattedData.chain === selected.chain
      );

      if (troveManager && troveManager.troveData) {
        // Map trove data to the format expected by the DashboardLayout component
        const trovesWithCollateralType = troveManager.troveData.map((trove) => {
          return {
            id: trove.troveId,
            owner: trove.ownerAddress,
            collateral: `${parseFloat(trove.coll).toFixed(4)} ${
              troveManager.collateralSymbol
            }`,
            debtAmount: trove.entire_debt,
            debtInFront: trove.debtInFront || 0, // Add debtInFront property
            interestRate: trove.annualInterestRate,
            liquidationPrice: troveManager.mcr
              ? (trove.entire_debt * troveManager.mcr) /
                (100 * parseFloat(trove.coll))
              : 0,
            collateralRatio: trove.colRatio || 0,
            status:
              trove.status === 0
                ? "nonExistent"
                : trove.status === 1
                ? "active"
                : trove.status === 2
                ? "closedByOwner"
                : trove.status === 3
                ? "closedByLiquidation"
                : trove.status === 4
                ? "zombie"
                : "unknown",
          };
        });

        allTroves.push(...trovesWithCollateralType);
      }
    });

    return allTroves;
  }, [formattedData, selectedProtocol, selectedCollaterals]);

  const showData = selectedProtocol && selectedCollaterals.length > 0;

  // Custom component to replace charts
  const CustomChartPanel = useMemo(() => {
    return showData && formattedData ? (
      <CollateralCards
        formattedData={formattedData}
        selectedCollateralIds={selectedCollaterals.map(
          (sc) => `${sc.chain}:${sc.troveManagerIndex}`
        )}
      />
    ) : null;
  }, [showData, formattedData, selectedCollaterals]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Protocol</label>
            <ProtocolCombobox
              protocols={protocols}
              selectedProtocol={selectedProtocol}
              onSelect={setSelectedProtocol}
              isLoading={isLoadingProtocols}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">
              Collateral Type
            </label>
            <CollateralFilter
              collaterals={availableCollaterals}
              selectedCollaterals={selectedCollaterals.map(
                (sc) => `${sc.chain}:${sc.troveManagerIndex}`
              )}
              onSelectionChange={(selectedIds) => {
                const newSelected = selectedIds.map((id) => {
                  const [chain, indexStr] = id.split(":");
                  return {
                    chain,
                    troveManagerIndex: parseInt(indexStr, 10),
                  };
                });
                setSelectedCollaterals(newSelected);
              }}
            />
          </div>
        </div>

        {selectedProtocol === null && (
          <Alert
            variant="default"
            className="bg-amber-50 text-amber-800 border-amber-200"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please select a protocol to view trove data.
            </AlertDescription>
          </Alert>
        )}
        {selectedProtocol !== null && selectedCollaterals.length === 0 && (
          <Alert
            variant="default"
            className="bg-amber-50 text-amber-800 border-amber-200"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please select at least one collateral type to view trove data.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {showData ? (
        <DashboardLayout
          data={filteredTroves}
          customChartPanel={CustomChartPanel}
          disableChartControls={true}
          customTitle="Collaterals"
        />
      ) : (
        <Card className="w-full">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No Trove Data Available</p>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Select a protocol and at least one collateral type to view trove
              data.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
