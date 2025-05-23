"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, LineChart, BarChart, Table as TableIcon } from "lucide-react";
import { DualAxisChart } from "./dual-axis-chart";
import { LogChart } from "./log-chart";
import { useTheme } from "next-themes";
import { TableChart } from "./table-chart";

interface ChartContainerProps {
  chartId: string;
  chartType:
    | "crDa"
    | "pricesLiqs"
    | "lstDetails"
    | "liquidationEvents"
    | "redemptionEvents"
    | "liqDepth"; // Add the new chart type
  data: any[];
  monthlyData: any[];
  dataType: "protocols" | "troves";
  chartData?: any;
  onChangeType: (
    type:
      | "crDa"
      | "pricesLiqs"
      | "lstDetails"
      | "liquidationEvents"
      | "redemptionEvents"
      | "liqDepth" // Add the new chart type
  ) => void;
  onRemove: () => void;
  selectedTroveManagerIndex: number | null;
  liquidationEvents?: Array<any>; // Add prop for liquidation events
  redemptionEvents?: Array<any>; // Add prop for redemption events
}

// Chart type options - add liqDepth option
const chartTypes = [
  { value: "crDa", label: "CR/TVL", icon: BarChart },
  { value: "pricesLiqs", label: "Prices/Liqs", icon: LineChart },
  { value: "lstDetails", label: "LST Details", icon: LineChart },
  { value: "liquidationEvents", label: "Liquidations", icon: TableIcon },
  { value: "redemptionEvents", label: "Redemptions", icon: TableIcon },
  { value: "liqDepth", label: "Liquidity Depth", icon: LineChart },
];

// Add to chart titles
const chartTitles = {
  protocols: {
    crDa: "CR/TVL",
    pricesLiqs: "Prices & Liquidations",
    liquidationEvents: "Liquidation Events",
    redemptionEvents: "Redemption Events",
    lstDetails: "LST Details",
    liqDepth: "Liquidity Depth",
  },
  troves: {
    crDa: "CR/TVL",
    pricesLiqs: "Prices & Liquidations",
    lstDetails: "LST Details",
    liquidationEvents: "Liquidation Events",
    redemptionEvents: "Redemption Events",
    liqDepth: "Liquidity Depth",
  },
};

export function ChartContainer({
  chartId,
  chartType,
  data,
  monthlyData,
  dataType,
  chartData,
  onChangeType,
  onRemove,
  selectedTroveManagerIndex,
  liquidationEvents = [], // Default to empty array
  redemptionEvents = [], // Default to empty array
}: ChartContainerProps) {
  const [isHovering, setIsHovering] = useState(false);
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Detect if dark mode is active - use resolvedTheme for SSR compatibility
  const isDarkMode = resolvedTheme === "dark";

  // Handle client-side mounting to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const crDaData = chartData?.crDaData || { series: [] };
  const pricesLiqsData = chartData?.pricesLiqsData || { series: [] };
  const lstDetailsData = chartData?.lstDetailsData || { series: [] };
  const liqDepthData = chartData?.liqDepthData || { series: [] }; // Add this line

  // Only show LST Details and Liquidity Depth when trove manager is selected
  const availableChartTypes =
    selectedTroveManagerIndex !== null
      ? chartTypes
      : chartTypes.filter(
          (type) => type.value !== "lstDetails" && type.value !== "liqDepth"
        );

  const ChartIcon =
    chartTypes.find((type) => type.value === chartType)?.icon || BarChart;

  // Don't render charts until client-side mounted to ensure theme is correct
  if (!mounted) {
    return (
      <Card className="relative">
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <div className="flex items-center">
            <ChartIcon className="h-4 w-4 mr-2 text-muted-foreground" />
            <CardTitle className="text-sm">
              {chartTitles[dataType][chartType]}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={chartType}
              onValueChange={(value) =>
                onChangeType(
                  value as
                    | "crDa"
                    | "pricesLiqs"
                    | "lstDetails"
                    | "liquidationEvents"
                    | "redemptionEvents"
                    | "liqDepth"
                )
              }
            >
              <SelectTrigger className="w-[160px] h-8">
                <SelectValue
                  placeholder="Select chart type"
                  className="whitespace-nowrap overflow-hidden text-ellipsis"
                />
              </SelectTrigger>
              <SelectContent>
                {availableChartTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center whitespace-nowrap">
                      <type.icon className="h-4 w-4 mr-2 flex-shrink-0" />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="py-2">
          <div className="flex items-center justify-center h-[250px]">
            <span className="text-muted-foreground">Loading chart...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="relative"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <CardHeader className="py-3 flex flex-row items-center justify-between">
        <div className="flex items-center">
          <ChartIcon className="h-4 w-4 mr-2 text-muted-foreground" />
          <CardTitle className="text-sm">
            {chartTitles[dataType][chartType]}
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={chartType}
            onValueChange={(value) =>
              onChangeType(
                value as
                  | "crDa"
                  | "pricesLiqs"
                  | "lstDetails"
                  | "liquidationEvents"
                  | "redemptionEvents"
                  | "liqDepth"
              )
            }
          >
            <SelectTrigger className="w-[160px] h-8">
              <SelectValue
                placeholder="Select chart type"
                className="whitespace-nowrap overflow-hidden text-ellipsis"
              />
            </SelectTrigger>
            <SelectContent>
              {availableChartTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <div className="flex items-center whitespace-nowrap">
                    <type.icon className="h-4 w-4 mr-2 flex-shrink-0" />
                    {type.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="py-2">
        {chartType === "pricesLiqs" ? (
          <DualAxisChart
            {...pricesLiqsData}
            height={250}
            darkMode={isDarkMode}
            rightAxisName="Price (USD)"
            rightAxisFormatter="currency"
          />
        ) : chartType === "lstDetails" ? (
          <DualAxisChart
            key={`lstDetails-${lstDetailsData.series?.length || 0}`} // Added dynamic key for remounting
            {...lstDetailsData}
            height={250}
            darkMode={isDarkMode}
            rightAxisFormatter="decimal"
            leftAxisFormatter="percentage"
            rightAxisMin={"dataMin"}
            rightAxisMax={"dataMax"}
            emptyMessage="Either selected collateral is not an LST, or no data is available."
          />
        ) : chartType === "liquidationEvents" ? (
          <TableChart
            dataType="liquidations"
            eventsData={liquidationEvents}
            height={250}
            darkMode={isDarkMode}
          />
        ) : chartType === "redemptionEvents" ? (
          <TableChart
            dataType="redemptions"
            eventsData={redemptionEvents}
            height={250}
            darkMode={isDarkMode}
          />
        ) : chartType === "liqDepth" ? (
          <LogChart
            {...liqDepthData}
            height={250}
            darkMode={isDarkMode}
            axisFormatter="percentage"
            emptyMessage="Loading..."
          />
        ) : (
          <DualAxisChart
            {...crDaData}
            height={250}
            darkMode={isDarkMode}
            rightAxisFormatter="percentage"
          />
        )}
      </CardContent>
    </Card>
  );
}
