"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DataPoint {
  date: number; // Unix timestamp
  value: number;
}

interface SeriesConfig {
  name: string;
  data: DataPoint[];
  type: "line" | "bar";
  yAxisIndex?: number;
  color?: string;
  areaStyle?: any;
  barWidth?: number;
  z?: number;
  showInLegend?: boolean; // New property to control legend visibility
}

interface DualAxisChartProps {
  title: string;
  series: SeriesConfig[];
  leftAxisName?: string;
  rightAxisName?: string;
  leftAxisMin?: number;
  leftAxisMax?: number;
  rightAxisMin?: number;
  rightAxisMax?: number;
  height?: number;
  darkMode?: boolean;
  dateFormat?: "short" | "medium" | "long"; // Controls date format style
}

export function DualAxisChart({
  title,
  series,
  leftAxisName = "",
  rightAxisName = "",
  leftAxisMin,
  leftAxisMax,
  rightAxisMin,
  rightAxisMax,
  height = 400,
  darkMode = true,
  dateFormat = "short",
}: DualAxisChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const prevDarkModeRef = useRef<boolean>(darkMode); // Track previous dark mode state

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

      // Get all unique dates from all series
      const allDates = new Set<number>();
      series.forEach((s) => {
        s.data.forEach((d) => allDates.add(d.date));
      });

      // Extract and sort timestamps (assuming they're already sorted, but ensuring it)
      const sortedTimestamps = Array.from(allDates).sort((a, b) => a - b);

      // Prepare series data
      const seriesData = series.map((s) => ({
        name: s.name,
        type: s.type,
        yAxisIndex: s.yAxisIndex || 0,
        data: sortedTimestamps.map((timestamp) => {
          const point = s.data.find((d) => d.date === timestamp);
          return point ? point.value : null;
        }),
        itemStyle: {
          color: s.color,
        },
        // Add connectNulls: true for line series to connect across gaps
        connectNulls: s.type === "line",
        // Remove symbols (dots) from line charts
        showSymbol: false,
        // Control whether to show in legend
        legendHoverLink: s.showInLegend !== false,
        // ECharts doesn't have direct "showInLegend" property, so we handle it below
        lineStyle:
          s.type === "line"
            ? {
                width: 2,
              }
            : undefined,
        areaStyle:
          s.type === "line" && s.areaStyle
            ? {
                opacity: 0.2,
              }
            : undefined,
        barWidth: s.barWidth,
        z: s.z,
        smooth: s.type === "line" ? 0.2 : undefined,
      }));

      // Filter out series that shouldn't appear in the legend
      const legendData = series
        .filter((s) => s.showInLegend !== false)
        .map((s) => s.name);

      // Format timestamps for display
      const formattedDates = sortedTimestamps.map((timestamp) => {
        const d = new Date(timestamp);

        // Format based on specified date format
        switch (dateFormat) {
          case "medium":
            return d.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
          case "long":
            return d.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
          case "short":
          default:
            return d.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
        }
      });

      // Set chart options
      const option: echarts.EChartsOption = {
        backgroundColor: darkMode ? "#1a1a1a" : "#ffffff", // Explicitly set white background when not in dark mode
        textStyle: {
          color: darkMode ? "#e0e0e0" : "#333333", // Use darker text color in light mode
        },
        title: {
          text: "", // Remove title from the chart itself since we're showing it in the CardTitle
          left: "left",
          textStyle: {
            color: darkMode ? "#ffffff" : "#333333", // Use darker text in light mode for title
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
            // Format the timestamp in tooltip
            const timestamp = sortedTimestamps[params[0].dataIndex];
            const date = new Date(timestamp);
            const formattedDate = date.toLocaleString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            let tooltipText = `<div style="margin: 0px 0 0; line-height: 1;">${formattedDate}</div>`;

            params.forEach((param: any) => {
              const marker = `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${param.color};"></span>`;
              const seriesName = param.seriesName;

              // Check which axis this series belongs to by using yAxisIndex directly
              // or falling back to the series configuration
              const seriesConfig = series[param.seriesIndex];
              const isLeftAxis = seriesConfig
                ? seriesConfig.yAxisIndex === 0
                : param.seriesOption && param.seriesOption.yAxisIndex === 0;

              // Format values based on axis
              let value;
              if (isLeftAxis) {
                // Left axis (USD format)
                value = new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                }).format(param.value || 0);
              } else {
                // Right axis (percentage format)
                const numValue =
                  typeof param.value === "number" ? param.value : 0;
                value = `${numValue.toFixed(2)}%`;
              }

              tooltipText += `<div style="margin: 6px 0 0; line-height: 1;">${marker} ${seriesName}: ${value}</div>`;
            });

            return tooltipText;
          },
        },
        legend: {
          data: legendData, // Use filtered legend data
          right: "5%",
          textStyle: {
            color: darkMode ? "#e0e0e0" : "#333333",
          },
        },
        grid: {
          left: "3%",
          right: "4%",
          bottom: "3%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: formattedDates,
          axisLine: {
            lineStyle: {
              color: darkMode ? "#555" : "#ddd",
            },
          },
          axisLabel: {
            color: darkMode ? "#e0e0e0" : "#666666",
            rotate: sortedTimestamps.length > 10 ? 45 : 0,
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
        yAxis: [
          {
            type: "value",
            name: leftAxisName,
            position: "left",
            min: leftAxisMin,
            max: leftAxisMax,
            axisLine: {
              lineStyle: {
                color: darkMode ? "#555" : "#ddd",
              },
            },
            axisLabel: {
              formatter: (value: number) => {
                // Format currency values
                if (value >= 1000000) {
                  return `$${(value / 1000000).toFixed(1)}M`;
                } else if (value >= 1000) {
                  return `$${(value / 1000).toFixed(1)}K`;
                }
                return `$${value}`;
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
          {
            type: "value",
            name: rightAxisName,
            position: "right",
            min: rightAxisMin,
            max: rightAxisMax,
            axisLine: {
              lineStyle: {
                color: darkMode ? "#555" : "#ddd",
              },
            },
            axisLabel: {
              formatter: (value: number) => `${value.toFixed(2)}%`,
              color: darkMode ? "#e0e0e0" : "#666666",
            },
            splitLine: {
              show: false,
            },
          },
        ],
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
    leftAxisName,
    rightAxisName,
    leftAxisMin,
    leftAxisMax,
    rightAxisMin,
    rightAxisMax,
    darkMode,
    dateFormat,
  ]);

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
      <CardContent>
        <div
          ref={chartRef}
          style={{
            width: "100%",
            height: `${height}px`,
          }}
        />
      </CardContent>
    </Card>
  );
}
