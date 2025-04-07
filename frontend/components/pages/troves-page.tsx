"use client";

import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  generateTrovesData,
  getUniqueProtocols,
  getCollateralsByProtocol,
  Trove,
} from "@/lib/dummy-data";
import { CollateralFilter } from "@/components/collateral-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProtocolCombobox } from "@/components/protocol-combobox";

// Custom component to render in the charts panel
const CollateralCards = ({
  collaterals,
  troves,
}: {
  collaterals: string[];
  troves: Trove[];
}) => {
  // Calculate stats for each collateral type
  const collateralStats = useMemo(() => {
    const stats: Record<
      string,
      { totalDebt: number; avgPrice: number; avgCR: number; minCR: number }
    > = {};

    collaterals.forEach((collateral) => {
      const trovesWithCollateral = troves.filter(
        (trove) => trove.collateralType === collateral
      );

      if (trovesWithCollateral.length === 0) return;

      const totalDebt = trovesWithCollateral.reduce(
        (sum, trove) => sum + trove.debtAmount,
        0
      );
      const avgPrice =
        trovesWithCollateral.reduce(
          (sum, trove) => sum + trove.liquidationPrice,
          0
        ) / trovesWithCollateral.length;
      const avgCR =
        trovesWithCollateral.reduce(
          (sum, trove) => sum + trove.collateralRatio,
          0
        ) / trovesWithCollateral.length;

      // For MCR, simulate a value based on status
      const minCR = Math.min(
        ...trovesWithCollateral.map((trove) =>
          trove.status === "danger"
            ? 110
            : trove.status === "warning"
            ? 120
            : 130
        )
      );

      stats[collateral] = {
        totalDebt,
        avgPrice,
        avgCR,
        minCR,
      };
    });

    return stats;
  }, [collaterals, troves]);

  return (
    <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 p-4">
      {collaterals.map((collateral) => (
        <Card key={collateral} className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">{collateral}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Total Debt:
                </span>
                <span className="font-medium">
                  ${collateralStats[collateral]?.totalDebt.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Price:</span>
                <span className="font-medium">
                  $
                  {collateralStats[collateral]?.avgPrice.toLocaleString(
                    undefined,
                    { maximumFractionDigits: 2 }
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">CR:</span>
                <span className="font-medium">
                  {collateralStats[collateral]?.avgCR.toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">MCR:</span>
                <span className="font-medium">
                  {collateralStats[collateral]?.minCR}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export function TrovesPage() {
  const troves = useMemo(() => generateTrovesData(), []);
  const protocols = useMemo(() => getUniqueProtocols(troves), [troves]);

  // Changed to null initial value instead of "Aave"
  const [selectedProtocol, setSelectedProtocol] = useState<string | null>(null);
  const [selectedCollaterals, setSelectedCollaterals] = useState<string[]>([]);

  const availableCollaterals = useMemo(() => {
    if (!selectedProtocol) return [];
    return getCollateralsByProtocol(troves, selectedProtocol);
  }, [troves, selectedProtocol]);

  const filteredTroves = useMemo(() => {
    if (!selectedProtocol || selectedCollaterals.length === 0) return [];

    return troves.filter(
      (trove) =>
        trove.protocol === selectedProtocol &&
        selectedCollaterals.includes(trove.collateralType)
    );
  }, [troves, selectedProtocol, selectedCollaterals]);

  const showData = selectedProtocol && selectedCollaterals.length > 0;

  // Custom component to replace charts
  const CustomChartPanel = useMemo(() => {
    return showData ? (
      <CollateralCards
        collaterals={selectedCollaterals}
        troves={filteredTroves}
      />
    ) : null;
  }, [showData, selectedCollaterals, filteredTroves]);

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
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">
              Collateral Type
            </label>
            <CollateralFilter
              collaterals={availableCollaterals}
              selectedCollaterals={selectedCollaterals}
              onSelectionChange={setSelectedCollaterals}
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
