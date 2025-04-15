"use client";

import React, { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TableChartProps {
  dataType: "protocols" | "troves" | "liquidations" | "redemptions";
  eventsData?: Array<any>;
  height?: number;
  darkMode?: boolean;
}

export function TableChart({
  dataType,
  eventsData = [], // New prop for passing liquidation or redemption events
  height = 250,
  darkMode = false,
}: TableChartProps) {
  const [pageIndex, setPageIndex] = useState(0);

  // Calculate rows per page based on height
  // Each row is approximately 40px tall including header
  const rowsPerPage = Math.floor((height - 40) / 34);

  // Use provided events data
  const data = useMemo(() => {
    if (dataType === "liquidations" || dataType === "redemptions") {
      return eventsData.length > 0 ? eventsData : [];
    }
    return []; // Return empty array instead of dummy data
  }, [dataType, eventsData]);

  // Define columns based on dataType
  const columns = useMemo<ColumnDef<any>[]>(() => {
    if (dataType === "liquidations") {
      return [
        {
          accessorKey: "date",
          header: "Date",
          cell: ({ row }) => (
            <div className="whitespace-nowrap">{row.getValue("date")}</div>
          ),
        },
        {
          accessorKey: "collateralSymbol",
          header: "Asset",
          cell: ({ row }) => (
            <div className="font-medium whitespace-nowrap">
              {row.getValue("collateralSymbol")}
            </div>
          ),
        },
        {
          accessorKey: "debtChange",
          header: "Amount",
          cell: ({ row }) => {
            const value = Math.abs(parseFloat(row.getValue("debtChange")));
            return (
              <div className="text-right whitespace-nowrap">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 2,
                }).format(value)}
              </div>
            );
          },
        },
        {
          accessorKey: "txHash",
          header: "Hash",
          cell: ({ row }) => {
            const txHash = row.getValue("txHash") as string;
            return (
              <div className="font-mono text-xs truncate">
                {`${txHash.substring(0, 6)}...${txHash.substring(
                  txHash.length - 4
                )}`}
              </div>
            );
          },
        },
      ];
    } else if (dataType === "redemptions") {
      return [
        {
          accessorKey: "date",
          header: "Date",
          cell: ({ row }) => (
            <div className="whitespace-nowrap">{row.getValue("date")}</div>
          ),
        },
        {
          accessorKey: "collateralSymbol",
          header: "Asset",
          cell: ({ row }) => (
            <div className="font-medium whitespace-nowrap">
              {row.getValue("collateralSymbol")}
            </div>
          ),
        },
        {
          accessorKey: "debtChange",
          header: "Amount",
          cell: ({ row }) => {
            const value = Math.abs(parseFloat(row.getValue("debtChange")));
            return (
              <div className="text-right whitespace-nowrap">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 2,
                }).format(value)}
              </div>
            );
          },
        },
        {
          accessorKey: "txHash",
          header: "Hash",
          cell: ({ row }) => {
            const txHash = row.getValue("txHash") as string;
            return (
              <div className="font-mono text-xs truncate">
                {`${txHash.substring(0, 6)}...${txHash.substring(
                  txHash.length - 4
                )}`}
              </div>
            );
          },
        },
      ];
    }

    return [];
  }, [dataType]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination: {
        pageIndex,
        pageSize: rowsPerPage,
      },
    },
    onPaginationChange: (updater) => {
      if (typeof updater === "function") {
        const newState = updater({
          pageIndex,
          pageSize: rowsPerPage,
        });
        setPageIndex(newState.pageIndex);
      } else {
        setPageIndex(updater.pageIndex);
      }
    },
    manualPagination: false,
    pageCount: Math.ceil(data.length / rowsPerPage),
  });

  return (
    <div className="space-y-2 flex flex-col" style={{ height: `${height}px` }}>
      <div
        className={`rounded-md border ${
          darkMode ? "border-gray-700" : "border-gray-200"
        } overflow-hidden flex-1`}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className={
                  darkMode
                    ? "bg-gray-800 hover:bg-gray-800 border-b border-gray-700"
                    : ""
                }
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={`h-9 px-2 ${
                      header.column.id !== "date" &&
                      header.column.id !== "collateralSymbol"
                        ? "text-right"
                        : ""
                    }`}
                  >
                    <div className="truncate">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={
                    darkMode
                      ? "border-b border-gray-700 hover:bg-gray-800/50"
                      : ""
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2 px-2">
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
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between mt-1">
        <div className="text-xs text-muted-foreground">
          Page {pageIndex + 1} of {table.getPageCount() || 1}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="h-7 w-7 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="h-7 w-7 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
