"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Simple container for charts
const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    id?: string;
    height?: number | string;
  }
>(({ id, className, children, height = "100%", ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <div
      id={chartId}
      ref={ref}
      className={cn("relative flex justify-center", className)}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
      }}
      {...props}
    >
      {children}
    </div>
  );
});
ChartContainer.displayName = "ChartContainer";

// Method to format currency values
const formatCurrency = (
  value: number,
  maximumFractionDigits = 2,
  notation?: Intl.NumberFormatOptions["notation"]
) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation,
    maximumFractionDigits,
  }).format(value);
};

// Method to format number values
const formatNumber = (
  value: number,
  maximumFractionDigits = 1,
  notation?: Intl.NumberFormatOptions["notation"]
) => {
  return new Intl.NumberFormat("en-US", {
    notation,
    maximumFractionDigits,
  }).format(value);
};

// Method to format percentage values
const formatPercent = (value: number, maximumFractionDigits = 2) => {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits,
  }).format(value / 100);

  return value >= 0 ? `+${formatted}` : formatted;
};

export { ChartContainer, formatCurrency, formatNumber, formatPercent };
