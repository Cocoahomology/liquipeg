"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

interface TransactionChartProps {
  data: any[];
  monthlyData?: any[];
  type?: "bar" | "line" | "pie";
  dataType?: "protocols" | "yields" | "troves";
  height?: number;
}

export function TransactionChart({
  data,
  monthlyData = [],
  type = "bar",
  dataType = "protocols",
  height = 400,
}: TransactionChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    // Initialize chart
    if (chartRef.current) {
      if (!chartInstance.current) {
        chartInstance.current = echarts.init(chartRef.current);
      }

      let option: any = {};

      if (type === "bar") {
        // Process data for the bar chart
        const processedData = processTransactionData(data, dataType);

        // Set different series based on data type
        let seriesData: echarts.EChartsOption["series"][] = [];
        let legendData: string[] = [];

        if (dataType === "protocols" || dataType === "yields") {
          const types =
            dataType === "protocols"
              ? ["deposit", "withdrawal", "transfer"]
              : ["mint", "burn", "transfer"];

          const colors = ["#3b82f6", "#ef4444", "#8b5cf6"]; // blue, red, purple

          legendData = types.map((t) => t.charAt(0).toUpperCase() + t.slice(1));

          seriesData = types.map((type, index) => ({
            name: legendData[index],
            type: "bar",
            stack: "total",
            emphasis: {
              focus: "series",
            },
            data: processedData[type + "s"],
            itemStyle: {
              color: colors[index],
            },
          }));
        } else if (dataType === "troves") {
          const types = ["deposit", "withdraw", "borrow", "repay"];
          const colors = ["#3b82f6", "#f97316", "#8b5cf6", "#22c55e"]; // blue, orange, purple, green

          legendData = types.map((t) => t.charAt(0).toUpperCase() + t.slice(1));

          seriesData = types.map((type, index) => ({
            name: legendData[index],
            type: "bar",
            stack: "total",
            emphasis: {
              focus: "series",
            },
            data: processedData[type + "s"],
            itemStyle: {
              color: colors[index],
            },
          }));
        }

        option = {
          tooltip: {
            trigger: "axis",
            axisPointer: {
              type: "shadow",
            },
            formatter: (params: any) => {
              let tooltip = params[0].name + "<br/>";

              params.forEach((param: any) => {
                tooltip += `${param.marker} ${
                  param.seriesName
                }: ${new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(param.value)}<br/>`;
              });

              return tooltip;
            },
          },
          legend: {
            data: legendData,
          },
          grid: {
            left: "3%",
            right: "4%",
            bottom: "3%",
            containLabel: true,
          },
          xAxis: {
            type: "category",
            data: processedData.dates,
            axisLabel: {
              rotate: 45,
              formatter: (value: string) =>
                new Date(value).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                }),
            },
          },
          yAxis: {
            type: "value",
            axisLabel: {
              formatter: (value: number) => "$" + value,
            },
          },
          series: seriesData,
        };
      } else if (type === "line") {
        // Line chart for monthly trends
        let seriesData: echarts.EChartsOption["series"][] = [];
        let legendData: string[] = [];

        if (dataType === "protocols") {
          legendData = ["Deposits", "Withdrawals", "Transfers"];
          const colors = ["#3b82f6", "#ef4444", "#8b5cf6"]; // blue, red, purple

          seriesData = [
            {
              name: "Deposits",
              type: "line",
              data: monthlyData.map((item) => item.deposits),
              smooth: true,
              lineStyle: { width: 3 },
              itemStyle: { color: colors[0] },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "rgba(59, 130, 246, 0.5)" },
                  { offset: 1, color: "rgba(59, 130, 246, 0.1)" },
                ]),
              },
            },
            {
              name: "Withdrawals",
              type: "line",
              data: monthlyData.map((item) => item.withdrawals),
              smooth: true,
              lineStyle: { width: 3 },
              itemStyle: { color: colors[1] },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "rgba(239, 68, 68, 0.5)" },
                  { offset: 1, color: "rgba(239, 68, 68, 0.1)" },
                ]),
              },
            },
            {
              name: "Transfers",
              type: "line",
              data: monthlyData.map((item) => item.transfers),
              smooth: true,
              lineStyle: { width: 3 },
              itemStyle: { color: colors[2] },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "rgba(139, 92, 246, 0.5)" },
                  { offset: 1, color: "rgba(139, 92, 246, 0.1)" },
                ]),
              },
            },
          ];
        } else if (dataType === "yields") {
          legendData = ["Mints", "Burns", "Transfers"];
          const colors = ["#22c55e", "#ef4444", "#8b5cf6"]; // green, red, purple

          seriesData = [
            {
              name: "Mints",
              type: "line",
              data: monthlyData.map((item) => item.mints),
              smooth: true,
              lineStyle: { width: 3 },
              itemStyle: { color: colors[0] },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "rgba(34, 197, 94, 0.5)" },
                  { offset: 1, color: "rgba(34, 197, 94, 0.1)" },
                ]),
              },
            },
            {
              name: "Burns",
              type: "line",
              data: monthlyData.map((item) => item.burns),
              smooth: true,
              lineStyle: { width: 3 },
              itemStyle: { color: colors[1] },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "rgba(239, 68, 68, 0.5)" },
                  { offset: 1, color: "rgba(239, 68, 68, 0.1)" },
                ]),
              },
            },
            {
              name: "Transfers",
              type: "line",
              data: monthlyData.map((item) => item.transfers),
              smooth: true,
              lineStyle: { width: 3 },
              itemStyle: { color: colors[2] },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "rgba(139, 92, 246, 0.5)" },
                  { offset: 1, color: "rgba(139, 92, 246, 0.1)" },
                ]),
              },
            },
          ];
        } else if (dataType === "troves") {
          legendData = ["Deposits", "Withdrawals", "Borrows", "Repayments"];
          const colors = ["#3b82f6", "#f97316", "#8b5cf6", "#22c55e"]; // blue, orange, purple, green

          seriesData = [
            {
              name: "Deposits",
              type: "line",
              data: monthlyData.map((item) => item.deposits),
              smooth: true,
              lineStyle: { width: 3 },
              itemStyle: { color: colors[0] },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "rgba(59, 130, 246, 0.5)" },
                  { offset: 1, color: "rgba(59, 130, 246, 0.1)" },
                ]),
              },
            },
            {
              name: "Withdrawals",
              type: "line",
              data: monthlyData.map((item) => item.withdrawals),
              smooth: true,
              lineStyle: { width: 3 },
              itemStyle: { color: colors[1] },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "rgba(249, 115, 22, 0.5)" },
                  { offset: 1, color: "rgba(249, 115, 22, 0.1)" },
                ]),
              },
            },
            {
              name: "Borrows",
              type: "line",
              data: monthlyData.map((item) => item.borrows),
              smooth: true,
              lineStyle: { width: 3 },
              itemStyle: { color: colors[2] },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "rgba(139, 92, 246, 0.5)" },
                  { offset: 1, color: "rgba(139, 92, 246, 0.1)" },
                ]),
              },
            },
            {
              name: "Repayments",
              type: "line",
              data: monthlyData.map((item) => item.repayments),
              smooth: true,
              lineStyle: { width: 3 },
              itemStyle: { color: colors[3] },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "rgba(34, 197, 94, 0.5)" },
                  { offset: 1, color: "rgba(34, 197, 94, 0.1)" },
                ]),
              },
            },
          ];
        }

        option = {
          tooltip: {
            trigger: "axis",
            formatter: (params: any) => {
              let tooltip = params[0].name + "<br/>";

              params.forEach((param: any) => {
                tooltip += `${param.marker} ${
                  param.seriesName
                }: ${new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(param.value)}<br/>`;
              });

              return tooltip;
            },
          },
          legend: {
            data: legendData,
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
            data: monthlyData.map((item) => {
              const date = new Date(item.date);
              return date.toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              });
            }),
          },
          yAxis: {
            type: "value",
            axisLabel: {
              formatter: (value: number) => "$" + value,
            },
          },
          series: seriesData,
        };
      } else if (type === "pie") {
        // Process data for the pie chart
        let pieData: Array<{ value: number; name: string }> = [];
        let colors: string[] = [];

        if (dataType === "protocols") {
          const transactionsByType = {
            deposit: 0,
            withdrawal: 0,
            transfer: 0,
          };

          data.forEach((transaction) => {
            transactionsByType[
              transaction.type as keyof typeof transactionsByType
            ] += transaction.amount;
          });

          pieData = [
            { value: transactionsByType.deposit, name: "Deposits" },
            { value: transactionsByType.withdrawal, name: "Withdrawals" },
            { value: transactionsByType.transfer, name: "Transfers" },
          ];

          colors = ["#3b82f6", "#ef4444", "#8b5cf6"]; // blue, red, purple
        } else if (dataType === "yields") {
          const transactionsByType = {
            mint: 0,
            burn: 0,
            transfer: 0,
          };

          data.forEach((transaction) => {
            transactionsByType[
              transaction.type as keyof typeof transactionsByType
            ] += transaction.amount;
          });

          pieData = [
            { value: transactionsByType.mint, name: "Mints" },
            { value: transactionsByType.burn, name: "Burns" },
            { value: transactionsByType.transfer, name: "Transfers" },
          ];

          colors = ["#22c55e", "#ef4444", "#8b5cf6"]; // green, red, purple
        } else if (dataType === "troves") {
          const transactionsByType = {
            deposit: 0,
            withdraw: 0,
            borrow: 0,
            repay: 0,
          };

          data.forEach((transaction) => {
            transactionsByType[
              transaction.type as keyof typeof transactionsByType
            ] += transaction.amount;
          });

          pieData = [
            { value: transactionsByType.deposit, name: "Deposits" },
            { value: transactionsByType.withdraw, name: "Withdrawals" },
            { value: transactionsByType.borrow, name: "Borrows" },
            { value: transactionsByType.repay, name: "Repayments" },
          ];

          colors = ["#3b82f6", "#f97316", "#8b5cf6", "#22c55e"]; // blue, orange, purple, green
        }

        option = {
          tooltip: {
            trigger: "item",
            formatter: (params: any) => {
              return `${params.name}: ${new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(params.value)} (${params.percent}%)`;
            },
          },
          legend: {
            orient: "horizontal",
            bottom: "bottom",
          },
          series: [
            {
              name: "Transaction Distribution",
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
              data: pieData,
              color: colors,
            },
          ],
        };
      }

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
  }, [data, monthlyData, type, dataType]);

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

  // Effect to handle chart initialization and resize
  useEffect(() => {
    // Small delay to ensure the container has the correct size
    const timer = setTimeout(() => {
      if (chartRef.current && chartInstance.current) {
        chartInstance.current.resize();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [data, type]);

  // Process transaction data for the chart
  function processTransactionData(
    transactions: any[],
    dataType: "protocols" | "yields" | "troves"
  ) {
    // Sort transactions by date
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Get unique dates
    const uniqueDates = Array.from(
      new Set(sortedTransactions.map((t) => t.date))
    );

    let result: any = {
      dates: uniqueDates,
    };

    if (dataType === "protocols") {
      // Initialize data arrays
      const deposits = new Array(uniqueDates.length).fill(0);
      const withdrawals = new Array(uniqueDates.length).fill(0);
      const transfers = new Array(uniqueDates.length).fill(0);

      // Fill data arrays
      sortedTransactions.forEach((transaction) => {
        const dateIndex = uniqueDates.indexOf(transaction.date);

        if (transaction.type === "deposit") {
          deposits[dateIndex] += transaction.amount;
        } else if (transaction.type === "withdrawal") {
          withdrawals[dateIndex] += transaction.amount;
        } else if (transaction.type === "transfer") {
          transfers[dateIndex] += transaction.amount;
        }
      });

      result = {
        ...result,
        deposits,
        withdrawals,
        transfers,
      };
    } else if (dataType === "yields") {
      // Initialize data arrays
      const mints = new Array(uniqueDates.length).fill(0);
      const burns = new Array(uniqueDates.length).fill(0);
      const transfers = new Array(uniqueDates.length).fill(0);

      // Fill data arrays
      sortedTransactions.forEach((transaction) => {
        const dateIndex = uniqueDates.indexOf(transaction.date);

        if (transaction.type === "mint") {
          mints[dateIndex] += transaction.amount;
        } else if (transaction.type === "burn") {
          burns[dateIndex] += transaction.amount;
        } else if (transaction.type === "transfer") {
          transfers[dateIndex] += transaction.amount;
        }
      });

      result = {
        ...result,
        mints,
        burns,
        transfers,
      };
    } else if (dataType === "troves") {
      // Initialize data arrays
      const deposits = new Array(uniqueDates.length).fill(0);
      const withdraws = new Array(uniqueDates.length).fill(0);
      const borrows = new Array(uniqueDates.length).fill(0);
      const repays = new Array(uniqueDates.length).fill(0);

      // Fill data arrays
      sortedTransactions.forEach((transaction) => {
        const dateIndex = uniqueDates.indexOf(transaction.date);

        if (transaction.type === "deposit") {
          deposits[dateIndex] += transaction.amount;
        } else if (transaction.type === "withdraw") {
          withdraws[dateIndex] += transaction.amount;
        } else if (transaction.type === "borrow") {
          borrows[dateIndex] += transaction.amount;
        } else if (transaction.type === "repay") {
          repays[dateIndex] += transaction.amount;
        }
      });

      result = {
        ...result,
        deposits,
        withdraws,
        borrows,
        repays,
      };
    }

    return result;
  }

  return (
    <div
      ref={chartRef}
      style={{
        width: "100%",
        height: height === 0 ? "100%" : `${height}px`,
        minHeight: "200px",
      }}
    />
  );
}
