"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, PieChart, LineChart, BarChart } from "lucide-react";
import { CrPieChart } from "./cr-pie-chart";
import { DualAxisChart } from "./dual-axis-chart";
import { useTheme } from "next-themes";

interface ChartContainerProps {
  chartId: string;
  chartType: "cr" | "crDa" | "pricesLiqs" | "lstDetails";
  data: any[];
  monthlyData: any[];
  dataType: "protocols" | "troves";
  chartData?: any;
  onChangeType: (type: "cr" | "crDa" | "pricesLiqs" | "lstDetails") => void;
  onRemove: () => void;
  selectedTroveManagerIndex: number | null;
}

// Chart type options
const chartTypes = [
  { value: "cr", label: "CR Chart", icon: PieChart },
  { value: "crDa", label: "CR/TVL", icon: BarChart },
  { value: "pricesLiqs", label: "Prices/Liqs", icon: LineChart },
  { value: "lstDetails", label: "LST Details", icon: LineChart },
];

// Chart titles by type and data type
const chartTitles = {
  protocols: {
    crDa: "CR/TVL",
    pricesLiqs: "Prices & Liquidations",
  },
  troves: {
    cr: "Trove CR History",
    crDa: "CR/TVL",
    pricesLiqs: "Prices & Liquidations",
    lstDetails: "LST Details",
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
}: ChartContainerProps) {
  const [isHovering, setIsHovering] = useState(false);
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  const crHistory = chartData?.crHistory || [];
  const crDaData = chartData?.crDaData || { series: [] };
  const pricesLiqsData = chartData?.pricesLiqsData || { series: [] };
  const lstDetailsData = chartData?.lstDetailsData || { series: [] };

  console.log("Chart data received:", chartData);
  console.log("CR History:", crHistory);
  console.log("CR vs TVL Data:", crDaData);
  console.log("Prices & Liqs Data:", pricesLiqsData);

  const availableChartTypes =
    selectedTroveManagerIndex !== null
      ? chartTypes
      : chartTypes.filter(
          (type) =>
            type.value !== "cr" &&
            type.value !== "pricesLiqs" &&
            type.value !== "lstDetails"
        );

  const ChartIcon =
    chartTypes.find((type) => type.value === chartType)?.icon || BarChart;

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
              onChangeType(value as "cr" | "crDa" | "pricesLiqs" | "lstDetails")
            }
            disabled={chartType === "cr" && selectedTroveManagerIndex === null}
          >
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue placeholder="Select chart type" />
            </SelectTrigger>
            <SelectContent>
              {availableChartTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <div className="flex items-center">
                    <type.icon className="h-4 w-4 mr-2" />
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
        {chartType === "cr" ? (
          <CrPieChart data={crHistory} height={250} />
        ) : chartType === "pricesLiqs" ? (
          <DualAxisChart
            {...pricesLiqsData}
            height={250}
            darkMode={isDarkMode}
            rightAxisName="Price (USD)"
            rightAxisFormatter="currency"
          />
        ) : chartType === "lstDetails" ? (
          <DualAxisChart
            {...lstDetailsData}
            height={250}
            darkMode={isDarkMode}
            rightAxisFormatter="decimal"
            leftAxisFormatter="percentage"
            rightAxisMin={"dataMin"}
            rightAxisMax={"dataMax"}
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
