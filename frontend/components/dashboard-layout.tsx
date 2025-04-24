"use client";

import { useState, useEffect, ReactNode, useCallback, useMemo } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ExpandableTable } from "@/components/expandable-table";
import { ChartContainer } from "@/components/chart-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "next-themes";
import React from "react";

// Define the Chart type
export type ChartConfig = {
  id: string;
  type:
    | "crDa"
    | "pricesLiqs"
    | "lstDetails"
    | "liquidationEvents"
    | "redemptionEvents"
    | "liqDepth"; // Add the new chart type
};

// Update the interface to include new props
export interface DashboardLayoutProps {
  data: any[];
  customChartPanel?: React.ReactNode;
  disableChartControls?: boolean;
  customTitle?: string;
  changePeriod?: "none" | "1d" | "7d" | "30d";
  onSelectItem?: (item: any) => void;
  selectedItemChartData?: any;
  selectedTroveManagerIndex?: number | null;
  liquidationEvents?: Array<any>; // New prop for displaying liquidation events
  redemptionEvents?: Array<any>; // New prop for displaying redemption events
}

export function DashboardLayout({
  data,
  customChartPanel,
  disableChartControls = false,
  customTitle,
  changePeriod = "none",
  onSelectItem,
  selectedItemChartData,
  selectedTroveManagerIndex = null,
  liquidationEvents = [],
  redemptionEvents = [],
}: DashboardLayoutProps) {
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [dataType, setDataType] = useState<"protocols" | "troves">("protocols");
  const [selectedTab, setSelectedTab] = useState("overview");

  // Track previous value of selectedTroveManagerIndex to detect changes
  const [prevTroveManagerIndex, setPrevTroveManagerIndex] = useState<
    number | null
  >(selectedTroveManagerIndex);

  // Get the current theme from next-themes
  const { theme, resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  // Add a mounting state to ensure theme is properly detected
  const [mounted, setMounted] = useState(false);

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true);
  }, []);

  // Effect to clear charts when selectedTroveManagerIndex changes between null and non-null
  useEffect(() => {
    const wasNull = prevTroveManagerIndex === null;
    const isNull = selectedTroveManagerIndex === null;

    // If the nullity status changed (null to not null or vice versa)
    if (wasNull !== isNull) {
      setCharts([]);
    }

    // Update previous value for next comparison
    setPrevTroveManagerIndex(selectedTroveManagerIndex);
  }, [selectedTroveManagerIndex, prevTroveManagerIndex]);

  // Update the handleSelectItem function to call the parent's onSelectItem
  const handleSelectItem = useCallback(
    (item: any) => {
      console.log("ITEM", item);
      setSelectedItem(item);
      if (onSelectItem) {
        onSelectItem(item);
      }
    },
    [onSelectItem]
  );

  // Determine data type based on the first item's properties - memoize this calculation
  useEffect(() => {
    if (data.length > 0) {
      if ("tvl" in data[0] && "troveManagers" in data[0]) {
        setDataType("protocols");
      } else if ("collateralRatio" in data[0]) {
        setDataType("troves");
      }
    }
  }, [data]);

  // Check if we're on mobile for responsive layout
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    // Initial check
    checkIfMobile();

    // Add event listener
    window.addEventListener("resize", checkIfMobile);

    // Cleanup
    return () => {
      window.removeEventListener("resize", checkIfMobile);
    };
  }, []);

  // Save panel sizes to localStorage
  const onLayout = (sizes: number[]) => {
    if (sizes.length === 2) {
      localStorage.setItem("dashboard-layout", JSON.stringify(sizes));
    }
  };

  // Get saved panel sizes from localStorage
  const getDefaultSizes = (): number[] => {
    if (typeof window === "undefined") return [50, 50];

    const savedSizes = localStorage.getItem("dashboard-layout");
    if (savedSizes) {
      try {
        return JSON.parse(savedSizes);
      } catch (e) {
        return [50, 50];
      }
    }
    return [50, 50];
  };

  // Memoize chart handlers
  const addChart = useCallback(() => {
    const newChart: ChartConfig = {
      id: uuidv4(),
      // Only allow CR chart type if a trove manager is selected
      type: "crDa", // Default is always crDa
    };
    setCharts((prev) => [...prev, newChart]);
  }, []);

  const updateChartType = useCallback(
    (
      id: string,
      type:
        | "crDa"
        | "pricesLiqs"
        | "lstDetails"
        | "liquidationEvents"
        | "redemptionEvents"
        | "liqDepth" // Add the new chart type
    ) => {
      // Only allow updating to lstDetails or liqDepth if a trove manager is selected
      if (
        (type === "lstDetails" || type === "liqDepth") &&
        selectedTroveManagerIndex === null
      ) {
        return;
      }

      setCharts((prev) =>
        prev.map((chart) => (chart.id === id ? { ...chart, type } : chart))
      );
    },
    [selectedTroveManagerIndex]
  );

  const removeChart = useCallback((id: string) => {
    setCharts((prev) => prev.filter((chart) => chart.id !== id));
  }, []);

  // Get transactions data based on selected item or all - memoize this result
  const transactionsData = useMemo(() => {
    return selectedItem
      ? selectedItem.transactions || []
      : data.flatMap((item) => item.transactions || []);
  }, [selectedItem, data]);

  // Get monthly data for charts - memoize to prevent regeneration
  const monthlyData = useMemo(() => generateMonthlyData(dataType), [dataType]);

  // Simple function to generate mock monthly data
  function generateMonthlyData(dataType: "protocols" | "troves") {
    const months = 12;
    const result = [];
    const currentDate = new Date();

    for (let i = 0; i < months; i++) {
      const date = new Date(currentDate);
      date.setMonth(currentDate.getMonth() - (months - 1 - i));

      const data: any = {
        date: date.toISOString().slice(0, 7), // YYYY-MM format
      };

      if (dataType === "protocols") {
        data.deposits = Math.floor(Math.random() * 5000000) + 1000000;
        data.withdrawals = Math.floor(Math.random() * 3000000) + 500000;
        data.transfers = Math.floor(Math.random() * 2000000) + 300000;
      } else if (dataType === "troves") {
        data.deposits = Math.floor(Math.random() * 2000000) + 500000;
        data.withdrawals = Math.floor(Math.random() * 1500000) + 300000;
        data.borrows = Math.floor(Math.random() * 3000000) + 1000000;
        data.repayments = Math.floor(Math.random() * 2500000) + 800000;
      }

      result.push(data);
    }

    return result;
  }

  // Function to determine the title to display
  const title = useMemo(() => {
    if (customTitle) return customTitle;
    if (selectedItem)
      return `${selectedItem.name || selectedItem.owner}'s Analytics`;
    return "Analytics";
  }, [customTitle, selectedItem]);

  const renderChartContent = () => {
    if (!mounted) {
      return (
        <div className="flex items-center justify-center h-[300px]">
          <span className="text-muted-foreground">Loading charts...</span>
        </div>
      );
    }

    if (customChartPanel) {
      return customChartPanel;
    }

    // If there's chart data for the selected item, use it
    const chartDataToUse = selectedItemChartData || {};

    return (
      <div className="space-y-4">
        {charts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground">
            <p>No charts added yet</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={addChart}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Chart/List
            </Button>
          </div>
        ) : (
          charts.map((chart) => {
            return (
              <ChartContainer
                key={chart.id}
                chartId={chart.id}
                chartType={chart.type}
                data={transactionsData}
                monthlyData={monthlyData}
                dataType={dataType}
                chartData={selectedItemChartData}
                onChangeType={(type) => updateChartType(chart.id, type)}
                onRemove={() => removeChart(chart.id)}
                selectedTroveManagerIndex={selectedTroveManagerIndex}
                liquidationEvents={liquidationEvents}
                redemptionEvents={redemptionEvents}
              />
            );
          })
        )}
      </div>
    );
  };

  // Determine if we should show event charts based on available data
  const showLiquidationsChart =
    liquidationEvents && liquidationEvents.length > 0;
  const showRedemptionsChart = redemptionEvents && redemptionEvents.length > 0;

  return (
    <div className="flex w-full min-h-svh">
      <div className="flex-1 flex flex-col w-full overflow-hidden">
        {/* Content */}
        <main className="flex-1 overflow-hidden p-4 w-full">
          <div className="h-full min-h-[600px]">
            {isMobile ? (
              // Stacked layout for mobile
              <div className="flex flex-col h-full gap-4">
                <Card className="flex-1 min-h-[300px]">
                  <CardContent className="p-6">
                    {/* Increased padding all around to compensate for missing header */}
                    <ScrollArea className="h-[calc(50vh-100px)]">
                      <ExpandableTable
                        data={data}
                        onSelectItem={handleSelectItem}
                        dataType={dataType}
                        changePeriod={changePeriod} // Pass the prop to ExpandableTable
                      />
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="flex-1 min-h-[300px]">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{title}</CardTitle>
                    {!disableChartControls && (
                      <Button variant="outline" size="sm" onClick={addChart}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Chart/List
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <ScrollArea className="h-[calc(50vh-100px)]">
                      {customChartPanel || renderChartContent()}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            ) : (
              // Resizable panels for desktop
              <div className="h-full w-full border rounded-lg overflow-hidden">
                <ResizablePanelGroup
                  direction="horizontal"
                  onLayout={onLayout}
                  className="h-full w-full"
                >
                  <ResizablePanel
                    defaultSize={getDefaultSizes()[0]}
                    minSize={30}
                  >
                    <div className="h-full flex flex-col border-r">
                      {/* No more Card - just a plain div with border-right */}
                      <div className="flex-1 p-6">
                        <ScrollArea className="h-[calc(100vh-120px)]">
                          <ExpandableTable
                            data={data}
                            onSelectItem={handleSelectItem}
                            dataType={dataType}
                            changePeriod={changePeriod} // Pass the prop to ExpandableTable
                          />
                        </ScrollArea>
                      </div>
                    </div>
                  </ResizablePanel>

                  <ResizableHandle withHandle className="bg-border" />

                  <ResizablePanel
                    defaultSize={getDefaultSizes()[1]}
                    minSize={30}
                    onResize={() => {
                      // Trigger chart resize when panel is resized
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(new Event("resize"));
                      }
                    }}
                  >
                    <div className="h-full flex flex-col">
                      {/* No more Card - just a plain div */}
                      <div className="sticky top-0 z-10 bg-card border-b flex flex-row items-center justify-between flex-shrink-0 p-4">
                        <h3 className="text-lg font-semibold">{title}</h3>
                        {!disableChartControls && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={addChart}
                          >
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Chart/List
                          </Button>
                        )}
                      </div>
                      <div className="p-4 flex-1">
                        <ScrollArea className="h-[calc(100vh-120px)]">
                          {customChartPanel || renderChartContent()}
                        </ScrollArea>
                      </div>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
