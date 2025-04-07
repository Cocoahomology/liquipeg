"use client";

import { useState } from "react";
import { TransactionChart } from "@/components/transaction-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, BarChart, LineChart, PieChart } from "lucide-react";

interface ChartContainerProps {
  chartId: string;
  chartType: "bar" | "line" | "pie";
  data: any[];
  monthlyData: any[];
  dataType: "protocols" | "yields" | "troves";
  onChangeType: (type: "bar" | "line" | "pie") => void;
  onRemove: () => void;
}

// Chart type options
const chartTypes = [
  { value: "bar", label: "Bar Chart", icon: BarChart },
  { value: "line", label: "Line Chart", icon: LineChart },
  { value: "pie", label: "Pie Chart", icon: PieChart },
];

// Chart titles by type and data type
const chartTitles = {
  protocols: {
    bar: "Protocol Transaction Amounts by Type",
    line: "Monthly Protocol Activity",
    pie: "Protocol Transaction Distribution",
  },
  yields: {
    bar: "Yield Transaction Amounts by Type",
    line: "Monthly Yield Activity",
    pie: "Yield Transaction Distribution",
  },
  troves: {
    bar: "Trove Transaction Amounts by Type",
    line: "Monthly Trove Activity",
    pie: "Trove Transaction Distribution",
  },
};

export function ChartContainer({
  chartId,
  chartType,
  data,
  monthlyData,
  dataType,
  onChangeType,
  onRemove,
}: ChartContainerProps) {
  const [isHovering, setIsHovering] = useState(false);

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
            onValueChange={(value) =>
              onChangeType(value as "bar" | "line" | "pie")
            }
          >
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue placeholder="Select chart type" />
            </SelectTrigger>
            <SelectContent>
              {chartTypes.map((type) => (
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
        <TransactionChart
          data={data}
          monthlyData={monthlyData}
          type={chartType}
          dataType={dataType}
          height={250}
        />
      </CardContent>
    </Card>
  );
}
