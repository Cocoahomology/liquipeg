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
import { X, BarChart, PieChart } from "lucide-react";
import { TvlDotPlot } from "./tvl-dot-plot";
import { CrPieChart } from "./cr-pie-chart";

interface ChartContainerProps {
  chartId: string;
  chartType: "tvl" | "cr";
  data: any[];
  monthlyData: any[];
  dataType: "protocols" | "troves";
  chartData?: any;
  onChangeType: (type: "tvl" | "cr") => void;
  onRemove: () => void;
  selectedTroveManagerIndex: number | null;
}

// Chart type options
const chartTypes = [
  { value: "tvl", label: "TVL Chart", icon: BarChart },
  { value: "cr", label: "CR Chart", icon: PieChart },
];

// Chart titles by type and data type
const chartTitles = {
  protocols: {
    tvl: "Protocol TVL History",
    cr: "Protocol CR History",
  },
  troves: {
    tvl: "Trove TVL History",
    cr: "Trove CR History",
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

  // Make sure we properly extract tvlHistory or provide a default empty array
  const tvlHistory = chartData?.tvlHistory || [];
  const crHistory = chartData?.crHistory || [];

  console.log("Chart data received:", chartData); // Debug logging
  console.log("TVL History:", tvlHistory); // Debug logging
  console.log("CR History:", crHistory); // Debug logging

  // Filter available chart types based on whether a trove manager is selected
  const availableChartTypes =
    selectedTroveManagerIndex !== null
      ? chartTypes // Show all chart types when trove manager is selected
      : chartTypes.filter((type) => type.value === "tvl"); // Only show TVL option when no trove manager

  // Get the current chart type icon
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
            onValueChange={(value) => onChangeType(value as "tvl" | "cr")}
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
        {chartType === "tvl" ? (
          <TvlDotPlot data={tvlHistory} height={250} />
        ) : (
          <CrPieChart data={crHistory} height={250} />
        )}
      </CardContent>
    </Card>
  );
}
