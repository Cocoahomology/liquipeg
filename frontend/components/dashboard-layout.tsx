"use client";

import { useState, useEffect, ReactNode } from "react";
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
import { generateMonthlyData } from "@/lib/dummy-data";
import { ScrollArea } from "@/components/ui/scroll-area";

// Define the Chart type
export type ChartConfig = {
  id: string;
  type: "bar" | "line" | "pie";
};

interface DashboardLayoutProps {
  data: any[];
  customChartPanel?: ReactNode;
  disableChartControls?: boolean;
  customTitle?: string;
}

export function DashboardLayout({
  data,
  customChartPanel,
  disableChartControls = false,
  customTitle,
}: DashboardLayoutProps) {
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [dataType, setDataType] = useState<"protocols" | "yields" | "troves">(
    "protocols"
  );

  // Determine data type based on the first item's properties
  useEffect(() => {
    if (data.length > 0) {
      if ("tvl" in data[0]) {
        setDataType("protocols");
      } else if ("symbol" in data[0]) {
        setDataType("yields");
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

  // Get transactions data based on selected item or all
  const getTransactionsData = () => {
    return selectedItem
      ? selectedItem.transactions
      : data.flatMap((item) => item.transactions);
  };

  // Get monthly data for charts
  const monthlyData = generateMonthlyData(dataType);

  // Add a new chart
  const addChart = () => {
    const newChart: ChartConfig = {
      id: uuidv4(),
      type: "bar", // Default chart type
    };
    setCharts([...charts, newChart]);
  };

  // Update chart type
  const updateChartType = (id: string, type: "bar" | "line" | "pie") => {
    setCharts(
      charts.map((chart) => (chart.id === id ? { ...chart, type } : chart))
    );
  };

  // Remove a chart
  const removeChart = (id: string) => {
    setCharts(charts.filter((chart) => chart.id !== id));
  };

  // Render chart content based on whether a custom panel is provided
  const renderChartContent = () => {
    if (customChartPanel) {
      return customChartPanel;
    }

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
          charts.map((chart) => (
            <ChartContainer
              key={chart.id}
              chartId={chart.id}
              chartType={chart.type}
              data={getTransactionsData()}
              monthlyData={monthlyData}
              dataType={dataType}
              onChangeType={(type) => updateChartType(chart.id, type)}
              onRemove={() => removeChart(chart.id)}
            />
          ))
        )}
      </div>
    );
  };

  // Function to determine the title to display
  const getTitle = () => {
    if (customTitle) return customTitle;
    if (selectedItem)
      return `${selectedItem.name || selectedItem.owner}'s Analytics`;
    return "Analytics";
  };

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
                        onSelectItem={setSelectedItem}
                        dataType={dataType}
                      />
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="flex-1 min-h-[300px]">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{getTitle()}</CardTitle>
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
                            onSelectItem={setSelectedItem}
                            dataType={dataType}
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
                        <h3 className="text-lg font-semibold">{getTitle()}</h3>
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
