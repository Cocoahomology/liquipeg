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

// Add rightAxisFormatter to the interface
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
  rightAxisFormatter?: "percentage" | "currency" | "decimal"; // Updated to include decimal
  leftAxisFormatter?: "currency" | "decimal" | "percentage"; // Add percentage option
  emptyMessage?: string; // Add this prop for showing message when no data is available
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
  rightAxisFormatter = "percentage", // Default to percentage format
  leftAxisFormatter = "currency", // Default to currency format
  emptyMessage = "No data available", // Default empty message
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
        data: s.data.map((point) => [point.date, point.value]), // Format data as [timestamp, value] pairs
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
            if (!params || params.length === 0) return "";

            // When using time axis, the value is directly available in the data
            const date = new Date(params[0].value[0]); // First element is the timestamp

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

              // With time axis, the value is the second element of the value array
              const actualValue = param.value[1];

              // Format values based on axis
              let formattedValue;
              if (isLeftAxis) {
                // Left axis (format based on leftAxisFormatter prop)
                const numValue =
                  typeof actualValue === "number" ? actualValue : 0;
                if (leftAxisFormatter === "decimal") {
                  formattedValue = numValue.toFixed(4); // Show raw decimal with 4 decimal places
                } else if (leftAxisFormatter === "percentage") {
                  formattedValue = `${numValue.toFixed(3)}%`; // Format as percentage with 3 decimal places
                } else {
                  // Default currency format
                  formattedValue = new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(numValue);
                }
              } else {
                // Right axis (dynamic formatting based on rightAxisFormatter prop)
                const numValue =
                  typeof actualValue === "number" ? actualValue : 0;
                if (rightAxisFormatter === "currency") {
                  formattedValue = new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 2,
                  }).format(numValue);
                } else if (rightAxisFormatter === "decimal") {
                  formattedValue = numValue.toFixed(4); // Show raw decimal with 4 decimal places
                } else {
                  formattedValue = `${numValue.toFixed(3)}%`; // Updated to 3 decimal places
                }
              }

              tooltipText += `<div style="margin: 6px 0 0; line-height: 1;">${marker} ${seriesName}: ${formattedValue}</div>`;
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
        // Add dataZoom component for x-axis zooming
        dataZoom: [
          {
            type: "slider",
            xAxisIndex: 0,
            filterMode: "filter",
            height: 20,
            bottom: 5, // Add some space between the zoom slider and the bottom of the chart
            borderColor: darkMode ? "#555" : "#ddd",
            // Add custom formatter to show only date without time
            rangeMode: ["value", "value"],
            labelFormatter: (value: number) => {
              const date = new Date(value);
              return date.toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              });
            },
            dataBackground: {
              lineStyle: {
                color: darkMode
                  ? "rgba(255, 255, 255, 0.3)"
                  : "rgba(70, 70, 70, 0.3)",
              },
              areaStyle: {
                color: darkMode
                  ? "rgba(255, 255, 255, 0.1)"
                  : "rgba(70, 70, 70, 0.1)",
              },
            },
            handleStyle: {
              color: darkMode ? "#888" : "#bbb",
              borderColor: darkMode ? "#555" : "#ddd",
            },
            moveHandleStyle: {
              color: darkMode ? "#ccc" : "#999",
            },
            selectedDataBackground: {
              lineStyle: {
                color: darkMode
                  ? "rgba(255, 255, 255, 0.6)"
                  : "rgba(70, 70, 70, 0.6)",
              },
              areaStyle: {
                color: darkMode
                  ? "rgba(255, 255, 255, 0.2)"
                  : "rgba(70, 70, 70, 0.2)",
              },
            },
            textStyle: {
              color: darkMode ? "#e0e0e0" : "#333",
            },
            start: 0,
            end: 100,
          },
          {
            type: "inside",
            xAxisIndex: 0,
            filterMode: "filter",
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
          },
        ],
        grid: {
          left: "3%",
          right: "4%",
          bottom: "10%", // Return to the original 10% bottom margin
          containLabel: true,
        },
        xAxis: {
          type: "time",
          boundaryGap: [0, 0],
          axisLine: {
            lineStyle: {
              color: darkMode ? "#555" : "#ddd",
            },
          },
          axisLabel: {
            color: darkMode ? "#e0e0e0" : "#666666",
            formatter: (value: number) => {
              const date = new Date(value);

              // Apply the date formatting
              switch (dateFormat) {
                case "medium":
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                case "long":
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                case "short":
                default:
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
              }
            },
            // Increase label rotation and add margin
            rotate: 45,
            margin: 8,
            // Use interval based on time rather than index
            interval: 3 * 24 * 3600 * 1000, // 3 days in milliseconds
          } as any,

          // Remove index-based tick interval that causes uneven spacing
          axisTick: {
            show: true,
            // Removed the interval function that was causing uneven spacing
          },

          // Configure time intervals for more consistent spacing
          minInterval: 24 * 3600 * 1000, // 1 day minimum interval
          maxInterval: 7 * 24 * 3600 * 1000, // 1 week maximum interval

          splitNumber: 0,

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
                // Format based on leftAxisFormatter
                if (leftAxisFormatter === "decimal") {
                  return value.toFixed(4);
                } else if (leftAxisFormatter === "percentage") {
                  return `${value.toFixed(2)}%`;
                } else {
                  // Default currency formatting
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
              formatter: (value: number) => {
                if (rightAxisFormatter === "currency") {
                  // Format as currency with appropriate scale
                  if (value >= 1000) {
                    return `$${(value / 1000).toFixed(1)}K`;
                  } else {
                    return `$${value.toFixed(0)}`;
                  }
                } else if (rightAxisFormatter === "decimal") {
                  // Format as decimal number
                  return value.toFixed(4);
                } else {
                  // Format as percentage
                  return `${value.toFixed(2)}%`;
                }
              },
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
    rightAxisFormatter,
    leftAxisFormatter,
  ]);

  // Check if there's any data to display
  const hasData =
    series &&
    series.length > 0 &&
    series.some((s) => s.data && s.data.length > 0);

  console.log("SERIES", series);

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
