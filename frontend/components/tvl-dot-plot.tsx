"use client";

import { useMemo } from "react";

interface TvlDotPlotProps {
  data: number[];
  height?: number;
}

export function TvlDotPlot({ data, height = 200 }: TvlDotPlotProps) {
  // Calculate metrics for the plot
  const metrics = useMemo(() => {
    if (!data || data.length === 0) {
      return { max: 0, min: 0, range: 0 };
    }

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1; // Avoid division by zero

    return { max, min, range };
  }, [data]);

  // Return empty state if no data
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: `${height}px` }}
      >
        No TVL history data available
      </div>
    );
  }

  // Calculate plot dimensions
  const plotWidth = "100%";
  const padding = 20; // Padding around the plot
  const plotHeight = height - padding * 2;
  const dotSize = 6;

  return (
    <div className="relative" style={{ height: `${height}px` }}>
      {/* Y-axis label */}
      <div className="absolute left-0 top-0 text-xs text-muted-foreground">
        TVL: {metrics.max.toLocaleString()}
      </div>

      {/* Plot area */}
      <div
        className="absolute inset-0 mt-6 mb-6"
        style={{ padding: `${padding}px` }}
      >
        <svg width={plotWidth} height={plotHeight}>
          {/* Draw dots for each data point */}
          {data.map((value, index) => {
            const x = (index / (data.length - 1)) * 100; // Percentage across the width
            const normalizedValue = metrics.range
              ? (value - metrics.min) / metrics.range
              : 0.5;
            const y = (1 - normalizedValue) * plotHeight; // Invert for SVG coordinates

            return (
              <g key={index}>
                {/* Dot */}
                <circle
                  cx={`${x}%`}
                  cy={y}
                  r={dotSize}
                  fill="#3b82f6" // Blue color
                  opacity={0.8}
                />

                {/* Value tooltip on hover */}
                <title>{value.toLocaleString()}</title>

                {/* Connect dots with line if not the last point */}
                {index < data.length - 1 && (
                  <line
                    x1={`${x}%`}
                    y1={y}
                    x2={`${((index + 1) / (data.length - 1)) * 100}%`}
                    y2={
                      (1 - (data[index + 1] - metrics.min) / metrics.range) *
                      plotHeight
                    }
                    stroke="#3b82f6"
                    strokeWidth="1.5"
                    strokeOpacity="0.5"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* X-axis label */}
      <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground">
        Data Points: {data.length}
      </div>
    </div>
  );
}
