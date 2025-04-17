"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DataPoint {
  date: number; // Unix timestamp
  value: number;
  log: number; // Logarithmic value for x-axis
}

interface SeriesConfig {
  name: string;
  data: DataPoint[];
  type: "line" | "bar";
  color?: string;
  barWidth?: number;
  showInLegend?: boolean;
}

interface ChartProps {
  title: string;
  series: SeriesConfig[];
  axisName?: string;
  axisMin?: number;
  axisMax?: number;
  height?: number;
  darkMode?: boolean;
  dateFormat?: "short" | "medium" | "long";
  axisFormatter?: "percentage" | "currency" | "decimal";
  emptyMessage?: string;
}

export function LogChart({
  title,
  series,
  axisName = "",
  axisMin,
  axisMax,
  height = 400,
  darkMode = true,
  dateFormat = "short",
  axisFormatter = "currency",
  emptyMessage = "No data available",
}: ChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const prevDarkModeRef = useRef<boolean>(darkMode);

  useEffect(() => {
    // Check if dark mode changed - if so, dispose and recreate chart
    if (prevDarkModeRef.current !== darkMode && chartInstance.current) {
      chartInstance.current.dispose();
      chartInstance.current = null;
    }

    // Update the ref with current dark mode value
    prevDarkModeRef.current = darkMode;

    // Initialize chart
    if (chartRef.current) {
      if (!chartInstance.current) {
        chartInstance.current = echarts.init(chartRef.current);
      }

      // Get all unique logs from all series
      const allLogs = new Set<number>();
      series.forEach((s) => {
        s.data.forEach((d) => {
          if (d.log !== undefined) allLogs.add(d.log);
        });
      });

      // Extract and sort logs
      const sortedLogs = Array.from(allLogs).sort((a, b) => a - b);

      // Prepare series data
      const seriesData = series.map((s) => ({
        name: s.name,
        type: s.type,
        data: s.data.map((point) => [point.log, point.value]),
        itemStyle: {
          color: s.color,
        },
        connectNulls: s.type === "line",
        showSymbol: false,
        legendHoverLink: s.showInLegend !== false,
        lineStyle: s.type === "line" ? { width: 2 } : undefined,
        barWidth: s.barWidth,
        smooth: s.type === "line" ? 0.2 : undefined,
      }));

      // Filter out series that shouldn't appear in the legend
      const legendData = series
        .filter((s) => s.showInLegend !== false)
        .map((s) => s.name);

      // Set chart options
      const option: echarts.EChartsOption = {
        backgroundColor: darkMode ? "#1a1a1a" : "#ffffff",
        textStyle: {
          color: darkMode ? "#e0e0e0" : "#333333",
        },
        title: {
          text: "",
          left: "left",
          textStyle: {
            color: darkMode ? "#ffffff" : "#333333",
          },
        },
        tooltip: {
          trigger: "axis",
          axisPointer: {
            type: "cross",
          },
          backgroundColor: darkMode
            ? "rgba(50, 50, 50, 0.9)"
            : "rgba(255, 255, 255, 0.9)",
          borderColor: darkMode ? "#555" : "#ddd",
          textStyle: {
            color: darkMode ? "#fff" : "#333",
          },
          formatter: (params: any) => {
            if (!params || params.length === 0) return "";

            let tooltipText = `<div style="margin: 0px 0 0; line-height: 1;">Amount: $${params[0].name}</div>`;

            params.forEach((param: any) => {
              const marker = `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${param.color};"></span>`;
              const seriesName = param.seriesName;
              const actualValue = param.value[1];

              // Format value based on axis formatter
              let formattedValue;
              const numValue =
                typeof actualValue === "number" ? actualValue : 0;

              if (axisFormatter === "decimal") {
                formattedValue = numValue.toFixed(4);
              } else if (axisFormatter === "percentage") {
                formattedValue = `${(numValue * 100).toFixed(2)}%`;
              } else {
                // Default currency format
                formattedValue = new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                }).format(numValue);
              }

              tooltipText += `<div style="margin: 6px 0 0; line-height: 1;">${marker} ${seriesName}: ${formattedValue}</div>`;
            });

            return tooltipText;
          },
        },
        legend: {
          data: legendData,
          right: "5%",
          textStyle: {
            color: darkMode ? "#e0e0e0" : "#333333",
          },
        },
        grid: {
          left: "3%",
          right: "4%",
          bottom: "10%",
          containLabel: true,
        },
        xAxis: {
          type: "log",
          logBase: 10,
          name: "Amount ($)",
          nameLocation: "middle",
          nameGap: 30,
          boundaryGap: [0, 0],
          axisLine: {
            lineStyle: {
              color: darkMode ? "#555" : "#ddd",
            },
          },
          axisLabel: {
            color: darkMode ? "#e0e0e0" : "#666666",
            formatter: (value: number) => {
              if (value >= 1000000) {
                return `$${(value / 1000000).toFixed(0)}M`;
              } else if (value >= 1000) {
                return `$${(value / 1000).toFixed(0)}K`;
              }
              return `$${value}`;
            },
          },
          axisTick: {
            show: true,
          },
          splitLine: {
            show: true,
            lineStyle: {
              color: darkMode
                ? "rgba(84, 84, 84, 0.3)"
                : "rgba(220, 220, 220, 0.8)",
            },
          },
        },
        yAxis: {
          type: "value",
          name: axisName,
          position: "right",
          min: axisMin,
          max: axisMax,
          axisLine: {
            lineStyle: {
              color: darkMode ? "#555" : "#ddd",
            },
          },
          axisLabel: {
            formatter: (value: number) => {
              if (axisFormatter === "decimal") {
                return value.toFixed(4);
              } else if (axisFormatter === "percentage") {
                return `${(value * 100).toFixed(2)}%`;
              } else {
                // Currency formatting
                if (value >= 1000000) {
                  return `$${(value / 1000000).toFixed(1)}M`;
                } else if (value >= 1000) {
                  return `$${(value / 1000).toFixed(1)}K`;
                }
                return `$${value}`;
              }
            },
            color: darkMode ? "#e0e0e0" : "#666666",
          },
          splitLine: {
            lineStyle: {
              color: darkMode
                ? "rgba(84, 84, 84, 0.3)"
                : "rgba(220, 220, 220, 0.8)",
            },
          },
        },
        series: seriesData,
      };

      // Set chart options
      chartInstance.current.setOption(option);
    }

    // Cleanup function
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [
    title,
    series,
    axisName,
    axisMin,
    axisMax,
    darkMode,
    dateFormat,
    axisFormatter,
  ]);

  // Check if there's any data to display
  const hasData =
    series &&
    series.length > 0 &&
    series.some((s) => s.data && s.data.length > 0);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    };

    window.addEventListener("resize", handleResize);

    // Create a ResizeObserver to watch for container size changes
    if (chartRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        if (chartInstance.current) {
          chartInstance.current.resize();
        }
      });

      resizeObserver.observe(chartRef.current);

      return () => {
        window.removeEventListener("resize", handleResize);
        resizeObserver.disconnect();
      };
    }

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <Card className={darkMode ? "bg-[#1a1a1a] border-gray-800" : "bg-white"}>
      <CardHeader className="py-1 px-3">
        <CardTitle
          className={`text-sm ${darkMode ? "text-white" : "text-gray-800"}`}
        >
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2">
        {hasData ? (
          <div
            ref={chartRef}
            style={{
              width: "100%",
              height: `${height + 30}px`,
              position: "relative",
              overflow: "visible",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: `${height}px`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              color: darkMode ? "#e0e0e0" : "#666666",
              fontSize: "16px",
              fontStyle: "italic",
            }}
          >
            {emptyMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
