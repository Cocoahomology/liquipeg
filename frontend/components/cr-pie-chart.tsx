"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { Card } from "@/components/ui/card";
import { formatPercent } from "@/components/ui/chart";

interface CrPieChartProps {
  data: number[];
  height?: number;
}

export function CrPieChart({ data = [], height = 250 }: CrPieChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    // Initialize chart
    if (chartRef.current) {
      if (!chartInstance.current) {
        chartInstance.current = echarts.init(chartRef.current);
      }

      // Process CR data for pie chart
      const processedData = processCrData(data);

      // Create pie chart option
      const option: echarts.EChartsOption = {
        tooltip: {
          trigger: "item",
          formatter: (params: any) => {
            const { name, value, percent } = params;
            return `${name}: ${value.toFixed(2)} (${percent}%)`;
          },
        },
        legend: {
          orient: "vertical",
          right: 10,
          top: "center",
          data: processedData.map((item) => item.name),
        },
        series: [
          {
            name: "Data",
            type: "pie",
            radius: ["40%", "70%"],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 10,
              borderColor: "#fff",
              borderWidth: 2,
            },
            label: {
              show: false,
              position: "center",
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 16,
                fontWeight: "bold",
              },
            },
            labelLine: {
              show: false,
            },
            data: processedData,
          },
        ],
        color: ["#4ade80", "#facc15", "#f87171"],
      };

      // Apply options to chart
      chartInstance.current.setOption(option);
    }

    // Cleanup function
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [data]);

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

  // Process CR data to create appropriate segments for the pie chart
  function processCrData(crValues: number[]) {
    // If no values or all zeros, return empty data
    if (!crValues.length || crValues.every((val) => val === 0)) {
      return [{ value: 1, name: "No Data" }];
    }

    // Create simple data items from the array values
    return crValues.map((value, index) => ({
      value,
      name: `Value ${index + 1}`,
    }));
  }

  return (
    <div
      ref={chartRef}
      style={{
        width: "100%",
        height: `${height}px`,
      }}
    />
  );
}
