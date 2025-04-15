"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, BarChart2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// Define thresholds for different metrics
const thresholds = {
  spTvl: [
    { value: 10, className: "bg-red-100 dark:bg-red-900/40" }, // Less than 10% of stableDebt - brightened for dark mode
    { value: 40, className: "bg-yellow-100 dark:bg-yellow-800/40" }, // Less than 40% of stableDebt - brightened for dark mode
  ],
  // Note: collateralRatio thresholds for TroveManager are defined inline because they depend on each row's CCR value

  // Updated maxLiqPrice thresholds for "less than" logic with currentOracle-to-maxLiqPrice ratio
  maxLiqPrice: [
    { value: 105, className: "bg-red-100 dark:bg-red-900/40" }, // Oracle < 1.05 * maxLiqPrice - danger - brightened for dark mode
    { value: 110, className: "bg-yellow-100 dark:bg-yellow-800/40" }, // Oracle < 1.10 * maxLiqPrice - warning - brightened for dark mode
  ],
};

// Add utility function for threshold-based highlighting
const getThresholdHighlight = (
  value: number,
  compareValue: number,
  thresholds: { value: number; className: string }[]
): string => {
  // Sort thresholds from lowest to highest value for proper evaluation
  const sortedThresholds = [...thresholds].sort((a, b) => a.value - b.value);

  // Calculate the percentage
  const percentage = (value / compareValue) * 100;

  // Find the first threshold that the value is less than
  const matchedThreshold = sortedThresholds.find(
    (threshold) => percentage < threshold.value
  );

  return matchedThreshold ? matchedThreshold.className : "";
};

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  const variants: Record<
    string,
    {
      variant: "default" | "outline" | "secondary" | "destructive";
      className: string;
    }
  > = {
    active: {
      variant: "default",
      className: "bg-green-500 hover:bg-green-500",
    },
    inactive: {
      variant: "outline",
      className:
        "text-gray-500 border-gray-300 dark:border-gray-600 dark:text-gray-400",
    },
    pending: {
      variant: "secondary",
      className:
        "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-500 dark:hover:bg-yellow-900/40",
    },
    completed: {
      variant: "default",
      className: "bg-green-500 hover:bg-green-500",
    },
    failed: { variant: "destructive", className: "" },
    safe: { variant: "default", className: "bg-green-500 hover:bg-green-500" },
    warning: {
      variant: "secondary",
      className:
        "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-500 dark:hover:bg-yellow-900/40",
    },
    danger: { variant: "destructive", className: "" },
  };

  const { variant, className } = variants[status] || {
    variant: "default",
    className: "",
  };

  return (
    <Badge variant={variant} className={className}>
      {status}
    </Badge>
  );
};

// Optimize ProtocolTroveManagersTable with memoization
const ProtocolTroveManagersTable = React.memo(
  ({
    troveManagers,
    onSelectItem,
    changePeriod = "none",
  }: {
    troveManagers: any;
    onSelectItem: (troveManager: any) => void;
    changePeriod?: string;
  }) => {
    // Helper function to format percentage change
    const formatPercentageChange = (value: number | null | undefined) => {
      if (value == null) return ""; // This checks for both null and undefined
      if (isNaN(value)) return ""; // Also check for NaN
      return value >= 0 ? `(+${value.toFixed(1)}%)` : `(${value.toFixed(1)}%)`;
    };

    // Helper function to get cell color based on percentage change
    const getChangeColor = (value: number | null | undefined) => {
      if (value == null) return ""; // This checks for both null and undefined
      if (isNaN(value)) return ""; // Also check for NaN
      return value >= 0
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400";
    };

    // Define columns for the subtable
    const columns: ColumnDef<any>[] = [
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          return (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSelectItem(row.original)}
              title="View Analytics"
              className="p-0 h-8 w-8"
            >
              <BarChart2 className="h-4 w-4" />
            </Button>
          );
        },
      },
      {
        accessorKey: "collateralSymbol",
        header: () => <div className="text-center">Coll</div>,
        cell: ({ row }) => {
          return (
            <div className="font-medium text-center">
              {row.getValue("collateralSymbol")}
            </div>
          );
        },
      },
      {
        accessorKey: "tvl",
        header: "TVL",
        cell: ({ row }) => {
          const tvl = Number.parseFloat(row.getValue("tvl"));
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
            maximumFractionDigits: 2,
          }).format(tvl);

          // Get the appropriate change value based on changePeriod
          let changeValue = null;
          let changeClassName = "";

          if (changePeriod === "1d") {
            changeValue = row.original.tvlChange1d;
            changeClassName = getChangeColor(changeValue);
          } else if (changePeriod === "7d") {
            changeValue = row.original.tvlChange7d;
            changeClassName = getChangeColor(changeValue);
          }

          return (
            <div className="text-right font-medium">
              {formatted}
              {changePeriod !== "none" && changeValue !== null && (
                <span className={`ml-1 text-xs ${changeClassName}`}>
                  {formatPercentageChange(changeValue)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "collateralRatio",
        header: "CR",
        cell: ({ row }) => {
          const ratio = Number.parseFloat(row.getValue("collateralRatio"));
          const ccr = row.original.ccr; // Get the CCR value from the row data

          // Get the appropriate change value based on changePeriod
          let changeValue = null;
          let changeClassName = "";

          if (changePeriod === "1d") {
            changeValue = row.original.collateralRatioChange1d;
            changeClassName = getChangeColor(changeValue);
          } else if (changePeriod === "7d") {
            changeValue = row.original.collateralRatioChange7d;
            changeClassName = getChangeColor(changeValue);
          }

          // Define thresholds dynamically based on the row's CCR value
          const ccrThresholds = ccr
            ? [
                { value: ccr, className: "bg-red-100 dark:bg-red-900/40" }, // Below CCR - danger - brightened for dark mode
                {
                  value: ccr * 1.1,
                  className: "bg-yellow-100 dark:bg-yellow-800/40",
                }, // Below 1.1*CCR - warning - brightened for dark mode
              ]
            : [];

          // Get threshold-based highlighting class for collateral ratio
          const highlightClass = ccr
            ? getThresholdHighlight(ratio, 100, ccrThresholds)
            : "";

          // Use whitespace-nowrap to ensure the value and percentage change stay on the same line
          return (
            <div
              className={`text-right ${highlightClass} px-2 py-1 rounded-md whitespace-nowrap`}
            >
              <span>{ratio.toFixed(1)}%</span>
              {changePeriod !== "none" && changeValue !== null && (
                <span className={`ml-1 text-xs ${changeClassName}`}>
                  {formatPercentageChange(changeValue)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "ratioSettings",
        header: () => <div className="text-center">CCR/MCR/SCR</div>,
        cell: ({ row }) => {
          return (
            <div className="text-center">
              {row.getValue("ratioSettings") || "N/A"}
            </div>
          );
        },
      },
      {
        accessorKey: "currentColUSDOracle",
        header: "Oracle Price",
        cell: ({ row }) => {
          const price = row.getValue("currentColUSDOracle");
          if (!price) return <div className="text-right">N/A</div>;

          const priceValue = Number.parseFloat(price as string);
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 2,
          }).format(priceValue);

          // Get the appropriate change value based on changePeriod
          let changeValue = null;
          let changeClassName = "";

          if (changePeriod === "1d") {
            changeValue = row.original.colUSDOracleChange1d;
            changeClassName = getChangeColor(changeValue);
          } else if (changePeriod === "7d") {
            changeValue = row.original.colUSDOracleChange7d;
            changeClassName = getChangeColor(changeValue);
          }

          return (
            <div className="text-right">
              {formatted}
              {changePeriod !== "none" && changeValue !== null && (
                <span className={`ml-1 text-xs ${changeClassName}`}>
                  {formatPercentageChange(changeValue)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "maxLiqPrice",
        header: "Next Liq",
        cell: ({ row }) => {
          const maxLiqPrice = row.getValue("maxLiqPrice");
          const currentOraclePrice = row.getValue("currentColUSDOracle");

          if (!maxLiqPrice || !currentOraclePrice)
            return <div className="text-right">N/A</div>;

          const maxLiqPriceValue = Number.parseFloat(maxLiqPrice as string);
          const oraclePriceValue = Number.parseFloat(
            currentOraclePrice as string
          );

          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 2,
          }).format(maxLiqPriceValue);

          // Calculate the ratio of oracle price to maxLiqPrice multiplied by 100
          const ratio = (oraclePriceValue / maxLiqPriceValue) * 100;

          // Use getThresholdHighlight to determine the highlight class
          const highlightClass = getThresholdHighlight(
            ratio,
            100, // Base percentage for comparison
            thresholds.maxLiqPrice
          );

          return (
            <div
              className={`text-right ${highlightClass} px-2 py-1 rounded-md`}
            >
              {formatted}
            </div>
          );
        },
      },
      {
        id: "combinedIR",
        header: "Avg/Min IR",
        cell: ({ row }) => {
          const avgIR = row.original.avgIR;
          const minIR = row.original.minIR;

          if (!avgIR && !minIR) return <div className="text-right">N/A</div>;

          const avgText = avgIR ? `${String(avgIR)}%` : "N/A";
          const minText = minIR ? `${String(minIR)}%` : "N/A";

          return <div className="text-right">{`${avgText}/${minText}`}</div>;
        },
      },
    ];

    // Use useMemo to prevent unnecessary recalculations
    const tableData = useMemo(
      () => Object.values(troveManagers),
      [troveManagers]
    );

    const table = useReactTable<any>({
      data: tableData,
      columns: columns as ColumnDef<unknown, any>[],
      getCoreRowModel: getCoreRowModel(),
    });

    return (
      <div className="rounded-md border bg-slate-50 dark:bg-slate-900 p-2 my-2">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="bg-slate-100 dark:bg-slate-800"
              >
                {headerGroup.headers.map((header) => {
                  const isCenteredHeader =
                    header.column.id === "collateralSymbol" ||
                    header.column.id === "ratioSettings";

                  return (
                    <TableHead
                      key={header.id}
                      className={`text-xs ${
                        isCenteredHeader ? "" : "text-right"
                      }`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="text-sm border-b border-slate-200 dark:border-slate-700"
                  data-id={row.id}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No trove managers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  }
);

interface ExpandableTableProps {
  data: any[];
  onSelectItem: (item: any) => void;
  dataType: "protocols" | "troves";
  changePeriod?: string; // Add the changePeriod prop
}

export function ExpandableTable({
  data,
  onSelectItem,
  dataType,
  changePeriod = "none", // Default to "none"
}: ExpandableTableProps) {
  // State for expanded rows
  const [expanded, setExpanded] = useState<ExpandedState>({});

  // Memoize handlers to prevent unnecessary re-renders
  const handleExpandedChange = useCallback((newExpanded: ExpandedState) => {
    setExpanded(newExpanded);
  }, []);

  const handleSelectItem = useCallback(
    (item: any) => {
      onSelectItem(item);
    },
    [onSelectItem]
  );

  // Memoize helper functions
  const formatPercentageChange = useCallback(
    (value: number | null | undefined) => {
      if (value == null) return ""; // This checks for both null and undefined
      if (isNaN(value)) return ""; // Also check for NaN
      return value >= 0 ? `(+${value.toFixed(1)}%)` : `(${value.toFixed(1)}%)`;
    },
    []
  );

  const getChangeColor = useCallback((value: number | null | undefined) => {
    if (value == null) return ""; // This checks for both null and undefined
    if (isNaN(value)) return ""; // Also check for NaN
    return value >= 0
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400";
  }, []);

  // Calculate columns based on dataType and data - memoize to prevent unnecessary recalculation
  const columns = useMemo(() => {
    const protocolColumns: ColumnDef<any>[] = [
      {
        id: "expander",
        header: () => null,
        cell: ({ row }) => {
          return (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                row.toggleExpanded();
              }}
              className="p-0 h-8 w-8"
            >
              {row.getIsExpanded() ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          return (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleSelectItem(row.original)}
              title="View Analytics"
              className="p-0 h-8 w-8"
            >
              <BarChart2 className="h-4 w-4" />
            </Button>
          );
        },
      },
      {
        accessorKey: "name",
        header: "Protocol",
      },
      {
        accessorKey: "chain",
        header: "Chain",
      },
      {
        accessorKey: "tvl",
        header: "TVL",
        cell: ({ row }) => {
          const tvl = Number.parseFloat(row.getValue("tvl"));
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
            maximumFractionDigits: 2,
          }).format(tvl);

          return <div className="text-right font-medium">{formatted}</div>;
        },
      },
      {
        accessorKey: "stableDebt",
        header: "Stable Debt",
        cell: ({ row }) => {
          const debt = Number.parseFloat(row.getValue("stableDebt"));
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
            maximumFractionDigits: 2,
          }).format(debt);

          return <div className="text-right font-medium">{formatted}</div>;
        },
      },
      {
        accessorKey: "spTvl",
        header: "SP TVL",
        cell: ({ row }) => {
          const spTvl = Number.parseFloat(row.getValue("spTvl"));
          const stableDebt = Number.parseFloat(row.getValue("stableDebt"));
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
            maximumFractionDigits: 2,
          }).format(spTvl);

          // Get threshold-based highlighting class
          const highlightClass =
            stableDebt > 0
              ? getThresholdHighlight(spTvl, stableDebt, thresholds.spTvl)
              : "";

          return (
            <div
              className={`text-right ${highlightClass} px-2 py-1 rounded-md`}
            >
              {formatted}
            </div>
          );
        },
      },
      {
        accessorKey: "collateralRatio",
        header: "CR",
        cell: ({ row }) => {
          const ratio = Number.parseFloat(row.getValue("collateralRatio"));
          return <div className="text-right">{ratio.toFixed(1)}%</div>;
        },
      },
    ];

    const troveColumns: ColumnDef<any>[] = [
      // Add ID column
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => {
          const id = row.getValue("id") as string;
          // Show a shortened version of the ID to save space
          return (
            <div className="font-mono text-xs">{`${id.substring(
              0,
              4
            )}...${id.substring(id.length - 3)}`}</div>
          );
        },
      },
      {
        accessorKey: "owner",
        header: "Owner",
        cell: ({ row }) => {
          const address = row.getValue("owner") as string;
          return (
            <div className="font-mono text-xs">{`${address.substring(
              0,
              4
            )}...${address.substring(address.length - 3)}`}</div>
          );
        },
      },
      {
        accessorKey: "collateral",
        header: "Collateral",
        cell: ({ row }) => (
          <div className="font-medium">{row.getValue("collateral")}</div>
        ),
      },
      {
        accessorKey: "debtAmount",
        header: "Debt",
        cell: ({ row }) => {
          const debt = Number.parseFloat(row.getValue("debtAmount"));
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 2,
          }).format(debt);
          return <div className="text-right font-medium">{formatted}</div>;
        },
      },
      {
        accessorKey: "debtInFront",
        header: "Debt In Front",
        cell: ({ row }) => {
          const debtInFront = Number.parseFloat(row.getValue("debtInFront"));
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
            maximumFractionDigits: 2,
          }).format(debtInFront);
          return <div className="text-right font-medium">{formatted}</div>;
        },
      },
      {
        accessorKey: "collateralRatio",
        header: "Coll. Ratio",
        cell: ({ row }) => {
          const ratio = Number.parseFloat(row.getValue("collateralRatio"));
          return <div className="text-right">{ratio.toFixed(0)}%</div>;
        },
      },
      // Add liquidation price column
      {
        accessorKey: "liquidationPrice",
        header: "Liq. Price",
        cell: ({ row }) => {
          const liquidationPrice = Number.parseFloat(
            row.getValue("liquidationPrice")
          );
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 2,
          }).format(liquidationPrice);
          return <div className="text-right">{formatted}</div>;
        },
      },
      // Add interest rate column
      {
        accessorKey: "interestRate",
        header: "Interest Rate",
        cell: ({ row }) => {
          const interestRate = Number.parseFloat(row.getValue("interestRate"));
          return <div className="text-right">{interestRate.toFixed(2)}%</div>;
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
      },
    ];

    const customProtocolColumns: ColumnDef<any>[] = [
      {
        id: "expander",
        header: () => null,
        cell: ({ row }) => {
          return (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                row.toggleExpanded();
              }}
              className="p-0 h-8 w-8"
            >
              {row.getIsExpanded() ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          return (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleSelectItem(row.original)}
              title="View Analytics"
              className="p-0 h-8 w-8"
            >
              <BarChart2 className="h-4 w-4" />
            </Button>
          );
        },
      },
      {
        accessorKey: "name",
        header: "Protocol",
      },
      {
        accessorKey: "chain",
        header: "Chain",
      },
      {
        accessorKey: "tvl",
        header: "TVL",
        cell: ({ row }) => {
          const tvl = Number.parseFloat(row.getValue("tvl"));
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
            maximumFractionDigits: 2,
          }).format(tvl);

          // Get the appropriate change value based on changePeriod
          let changeValue = null;
          let changeClassName = "";

          if (changePeriod === "1d") {
            changeValue = row.original.tvlChange1d;
            changeClassName = getChangeColor(changeValue);
          } else if (changePeriod === "7d") {
            changeValue = row.original.tvlChange7d;
            changeClassName = getChangeColor(changeValue);
          }

          return (
            <div className="text-right font-medium">
              {formatted}
              {changePeriod !== "none" && changeValue !== null && (
                <span className={`ml-1 text-xs ${changeClassName}`}>
                  {formatPercentageChange(changeValue)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "stableDebt",
        header: "Stable Debt",
        cell: ({ row }) => {
          const debt = Number.parseFloat(row.getValue("stableDebt"));
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
            maximumFractionDigits: 2,
          }).format(debt);

          // Get the appropriate change value based on changePeriod
          let changeValue = null;
          let changeClassName = "";

          if (changePeriod === "1d") {
            changeValue = row.original.stableDebtChange1d;
            changeClassName = getChangeColor(changeValue);
          } else if (changePeriod === "7d") {
            changeValue = row.original.stableDebtChange7d;
            changeClassName = getChangeColor(changeValue);
          }

          return (
            <div className="text-right font-medium">
              {formatted}
              {changePeriod !== "none" && changeValue !== null && (
                <span className={`ml-1 text-xs ${changeClassName}`}>
                  {formatPercentageChange(changeValue)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "spTvl",
        header: "SP TVL",
        cell: ({ row }) => {
          const spTvl = Number.parseFloat(row.getValue("spTvl"));
          const stableDebt = Number.parseFloat(row.getValue("stableDebt"));
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            notation: "compact",
            maximumFractionDigits: 2,
          }).format(spTvl);

          // Get threshold-based highlighting class
          const highlightClass =
            stableDebt > 0
              ? getThresholdHighlight(spTvl, stableDebt, thresholds.spTvl)
              : "";

          // Get the appropriate change value based on changePeriod
          let changeValue = null;
          let changeClassName = "";

          if (changePeriod === "1d") {
            changeValue = row.original.spTvlChange1d;
            changeClassName = getChangeColor(changeValue);
          } else if (changePeriod === "7d") {
            changeValue = row.original.spTvlChange7d;
            changeClassName = getChangeColor(changeValue);
          }

          return (
            <div
              className={`text-right ${highlightClass} px-2 py-1 rounded-md`}
            >
              {formatted}
              {changePeriod !== "none" && changeValue !== null && (
                <span className={`ml-1 text-xs ${changeClassName}`}>
                  {formatPercentageChange(changeValue)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "collateralRatio",
        header: "CR",
        cell: ({ row }) => {
          const ratio = Number.parseFloat(row.getValue("collateralRatio"));

          // Get the appropriate change value based on changePeriod
          let changeValue = null;
          let changeClassName = "";

          if (changePeriod === "1d") {
            changeValue = row.original.collateralRatioChange1d;
            changeClassName = getChangeColor(changeValue);
          } else if (changePeriod === "7d") {
            changeValue = row.original.collateralRatioChange7d;
            changeClassName = getChangeColor(changeValue);
          }

          return (
            <div className="text-right whitespace-nowrap">
              <span>{ratio.toFixed(1)}%</span>
              {changePeriod !== "none" && changeValue !== null && (
                <span className={`ml-1 text-xs ${changeClassName}`}>
                  {formatPercentageChange(changeValue)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "prev7DayProtocolRedemptionTotal",
        header: "Redemptions (7d)",
        cell: ({ row }) => {
          const redemption = Number.parseFloat(
            row.getValue("prev7DayProtocolRedemptionTotal") || "0"
          );
          const formatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 2,
          }).format(redemption);

          return <div className="text-right">{formatted}</div>;
        },
      },
    ];

    // Select columns based on data type and data format
    if (
      dataType === "protocols" &&
      data.length > 0 &&
      "troveManagers" in data[0]
    ) {
      // Use custom columns for the new protocol data format
      return customProtocolColumns;
    } else if (dataType === "protocols") {
      return protocolColumns;
    } else {
      return troveColumns;
    }
  }, [
    dataType,
    data,
    changePeriod,
    handleSelectItem,
    formatPercentageChange,
    getChangeColor,
  ]);

  // Instead of using useMemo to call useReactTable, memoize the config
  const tableConfig = useMemo(
    () => ({
      data,
      columns: columns as ColumnDef<unknown, any>[],
      state: {
        expanded,
      },
      onExpandedChange: handleExpandedChange,
      getSubRows: () => undefined,
      getCoreRowModel: getCoreRowModel(),
      getExpandedRowModel: getExpandedRowModel(),
    }),
    [data, columns, expanded, handleExpandedChange]
  );

  // Call useReactTable directly at the top level with the memoized config
  const table = useReactTable(tableConfig);

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const isNameOrChain =
                  header.column.id === "name" ||
                  header.column.id === "chain" ||
                  header.column.id === "owner" ||
                  header.column.id === "collateral";

                return (
                  <TableHead
                    key={header.id}
                    className={isNameOrChain ? "" : "text-right"}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <React.Fragment key={row.id}>
                <TableRow
                  data-state={row.getIsExpanded() ? "expanded" : "collapsed"}
                  className={
                    row.getIsExpanded() ? "bg-slate-50 dark:bg-slate-900" : ""
                  }
                  data-id={row.id}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
                {row.getIsExpanded() && (
                  <TableRow key={`expanded-${row.id}`}>
                    <TableCell colSpan={columns.length} className="p-0">
                      <ScrollArea className="h-[300px] px-8 py-2">
                        <div className="pr-4">
                          <h3 className="text-sm font-medium mb-2">
                            {dataType === "protocols" &&
                              typeof row.original === "object" &&
                              row.original !== null &&
                              "troveManagers" in row.original &&
                              "name" in row.original &&
                              `${row.original.name} Troves`}
                          </h3>

                          {dataType === "protocols" &&
                            typeof row.original === "object" &&
                            row.original !== null &&
                            "troveManagers" in row.original && (
                              <ProtocolTroveManagersTable
                                troveManagers={row.original.troveManagers || {}}
                                onSelectItem={handleSelectItem}
                                changePeriod={changePeriod}
                              />
                            )}

                          {dataType === "protocols" &&
                            typeof row.original === "object" &&
                            row.original !== null &&
                            !("troveManagers" in row.original) && (
                              <div className="text-center py-8 text-muted-foreground">
                                No transaction data available.
                              </div>
                            )}
                          {dataType === "troves" && (
                            <div className="text-center py-8 text-muted-foreground">
                              No transaction data available.
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
