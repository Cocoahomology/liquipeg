"use client";

import React, { useState } from "react";
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
import type {
  Protocol,
  ProtocolTransaction,
  YieldTransaction,
  Trove,
  TroveTransaction,
} from "@/lib/dummy-data";

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

// Transaction type badge component
const TransactionTypeBadge = ({ type }: { type: string }) => {
  const variants: Record<
    string,
    { variant: "default" | "outline" | "secondary"; className: string }
  > = {
    deposit: { variant: "default", className: "bg-blue-500 hover:bg-blue-500" },
    withdrawal: {
      variant: "outline",
      className:
        "border-red-300 text-red-500 dark:border-red-800 dark:text-red-400",
    },
    transfer: {
      variant: "secondary",
      className:
        "bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/40",
    },
    mint: { variant: "default", className: "bg-green-500 hover:bg-green-500" },
    burn: { variant: "default", className: "" },
    withdraw: {
      variant: "outline",
      className:
        "border-orange-300 text-orange-500 dark:border-orange-800 dark:text-orange-400",
    },
    borrow: {
      variant: "secondary",
      className:
        "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/40",
    },
    repay: {
      variant: "outline",
      className:
        "border-green-300 text-green-500 dark:border-green-800 dark:text-green-400",
    },
  };

  const { variant, className } = variants[type] || {
    variant: "default",
    className: "",
  };

  return (
    <Badge variant={variant} className={className}>
      {type}
    </Badge>
  );
};

// Helper function for consistent date display - simply returns the string as is
const formatDate = (dateString: string) => {
  // Just return the date string without any processing
  return dateString;
};

// Subtable component for protocols
const ProtocolSubTable = ({
  transactions,
  onSelectTransaction,
}: {
  transactions: ProtocolTransaction[];
  onSelectTransaction: (transaction: ProtocolTransaction) => void;
}) => {
  // Define columns for the subtable
  const columns: ColumnDef<ProtocolTransaction>[] = [
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => {
        return <div>{row.getValue("date")}</div>;
      },
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => {
        const amount = Number.parseFloat(row.getValue("amount"));
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 2,
        }).format(amount);
        return <div className="text-right font-medium">{formatted}</div>;
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <TransactionTypeBadge type={row.getValue("type")} />,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
    },
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => (
        <div className="font-mono text-xs">{row.getValue("reference")}</div>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <div
          className="truncate max-w-[150px]"
          title={row.getValue("description")}
        >
          {row.getValue("description")}
        </div>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        return (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSelectTransaction(row.original)}
            title="View Chart"
            className="p-0 h-8 w-8"
          >
            <BarChart2 className="h-4 w-4" />
          </Button>
        );
      },
    },
  ];

  const table = useReactTable({
    data: transactions,
    columns,
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
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="text-xs">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No transactions found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

// Subtable component for yields (formerly stablecoins)
const YieldSubTable = ({
  transactions,
  onSelectTransaction,
}: {
  transactions: YieldTransaction[];
  onSelectTransaction: (transaction: YieldTransaction) => void;
}) => {
  // Define columns for the subtable
  const columns: ColumnDef<YieldTransaction>[] = [
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => {
        return <div>{row.getValue("date")}</div>;
      },
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => {
        const amount = Number.parseFloat(row.getValue("amount"));
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 2,
        }).format(amount);
        return <div className="text-right font-medium">{formatted}</div>;
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <TransactionTypeBadge type={row.getValue("type")} />,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
    },
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => (
        <div className="font-mono text-xs">{row.getValue("reference")}</div>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <div
          className="truncate max-w-[150px]"
          title={row.getValue("description")}
        >
          {row.getValue("description")}
        </div>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        return (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSelectTransaction(row.original)}
            title="View Chart"
            className="p-0 h-8 w-8"
          >
            <BarChart2 className="h-4 w-4" />
          </Button>
        );
      },
    },
  ];

  const table = useReactTable({
    data: transactions,
    columns,
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
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="text-xs">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No transactions found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

// Subtable component for troves
const TroveSubTable = ({
  transactions,
  onSelectTransaction,
}: {
  transactions: TroveTransaction[];
  onSelectTransaction: (transaction: TroveTransaction) => void;
}) => {
  // Define columns for the subtable
  const columns: ColumnDef<TroveTransaction>[] = [
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => {
        return <div>{row.getValue("date")}</div>;
      },
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => {
        const amount = Number.parseFloat(row.getValue("amount"));
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 2,
        }).format(amount);
        return <div className="text-right font-medium">{formatted}</div>;
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <TransactionTypeBadge type={row.getValue("type")} />,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
    },
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => (
        <div className="font-mono text-xs">{row.getValue("reference")}</div>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <div
          className="truncate max-w-[150px]"
          title={row.getValue("description")}
        >
          {row.getValue("description")}
        </div>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        return (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSelectTransaction(row.original)}
            title="View Chart"
            className="p-0 h-8 w-8"
          >
            <BarChart2 className="h-4 w-4" />
          </Button>
        );
      },
    },
  ];

  const table = useReactTable({
    data: transactions,
    columns,
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
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="text-xs">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No transactions found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

interface ExpandableTableProps {
  data: any[];
  onSelectItem: (item: any) => void;
  dataType: "protocols" | "yields" | "troves";
}

export function ExpandableTable({
  data,
  onSelectItem,
  dataType,
}: ExpandableTableProps) {
  // State for expanded rows - use an object with stringified keys
  const [expanded, setExpanded] = useState<ExpandedState>({});

  // Define columns for protocols
  const protocolColumns: ColumnDef<Protocol>[] = [
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
      accessorKey: "name",
      header: "Protocol",
    },
    {
      accessorKey: "category",
      header: "Category",
    },
    {
      accessorKey: "tvl",
      header: "TVL",
      cell: ({ row }) => {
        const tvl = Number.parseFloat(row.getValue("tvl"));
        // Use a more standardized formatting approach
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          notation: "compact",
          maximumFractionDigits: 0, // Change from 1 to 0 to avoid .0 suffix
        }).format(tvl);
        return <div className="text-right font-medium">{formatted}</div>;
      },
    },
    {
      accessorKey: "users",
      header: "Users",
      cell: ({ row }) => {
        const users = Number.parseInt(row.getValue("users"));
        const formatted = new Intl.NumberFormat("en-US", {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(users);
        return <div className="text-right">{formatted}</div>;
      },
    },
    {
      accessorKey: "dailyVolume",
      header: "Daily Volume",
      cell: ({ row }) => {
        const volume = Number.parseFloat(row.getValue("dailyVolume"));
        // Standardize formatting to avoid hydration mismatch
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          notation: "compact",
          maximumFractionDigits: 0, // Change from 1 to 0 to avoid .0 suffix
        }).format(volume);
        return <div className="text-right font-medium">{formatted}</div>;
      },
    },
    {
      accessorKey: "weeklyChange",
      header: "Weekly Change",
      cell: ({ row }) => {
        const change = Number.parseFloat(row.getValue("weeklyChange"));
        const formatted = `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;
        return (
          <div
            className={`text-right ${
              change >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatted}
          </div>
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
            onClick={() => onSelectItem(row.original)}
            title="View Chart"
            className="p-0 h-8 w-8"
          >
            <BarChart2 className="h-4 w-4" />
          </Button>
        );
      },
    },
  ];

  // Define columns for yields
  const yieldColumns: ColumnDef<YieldTransaction>[] = [
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
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "symbol",
      header: "Symbol",
      cell: ({ row }) => (
        <div className="font-mono">{row.getValue("symbol")}</div>
      ),
    },
    {
      accessorKey: "price",
      header: "Price",
      cell: ({ row }) => {
        const price = Number.parseFloat(row.getValue("price"));
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 4,
          maximumFractionDigits: 4,
        }).format(price);
        return <div className="text-right font-medium">{formatted}</div>;
      },
    },
    {
      accessorKey: "marketCap",
      header: "Market Cap",
      cell: ({ row }) => {
        const marketCap = Number.parseFloat(row.getValue("marketCap"));
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          notation: "compact",
          maximumFractionDigits: 0, // Change from 1 to 0
        }).format(marketCap);
        return <div className="text-right">{formatted}</div>;
      },
    },
    {
      accessorKey: "volume24h",
      header: "24h Volume",
      cell: ({ row }) => {
        const volume = Number.parseFloat(row.getValue("volume24h"));
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          notation: "compact",
          maximumFractionDigits: 0, // Change from 1 to 0
        }).format(volume);
        return <div className="text-right">{formatted}</div>;
      },
    },
    {
      accessorKey: "change24h",
      header: "24h Change",
      cell: ({ row }) => {
        const change = Number.parseFloat(row.getValue("change24h"));
        const formatted = `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;
        return (
          <div
            className={`text-right ${
              change >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatted}
          </div>
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
            onClick={() => onSelectItem(row.original)}
            title="View Chart"
            className="p-0 h-8 w-8"
          >
            <BarChart2 className="h-4 w-4" />
          </Button>
        );
      },
    },
  ];

  // Define columns for troves
  const troveColumns: ColumnDef<Trove>[] = [
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
      accessorKey: "owner",
      header: "Owner",
      cell: ({ row }) => {
        const address = row.getValue("owner") as string;
        return (
          <div className="font-mono text-xs">{`${address.substring(
            0,
            6
          )}...${address.substring(address.length - 4)}`}</div>
        );
      },
    },
    {
      accessorKey: "collateralType",
      header: "Collateral",
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("collateralType")}</div>
      ),
    },
    {
      accessorKey: "collateralAmount",
      header: "Amount",
      cell: ({ row }) => {
        const amount = Number.parseFloat(row.getValue("collateralAmount"));
        return <div className="text-right">{amount.toFixed(2)}</div>;
      },
    },
    {
      accessorKey: "debtAmount",
      header: "Debt",
      cell: ({ row }) => {
        const debt = Number.parseFloat(row.getValue("debtAmount"));
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(debt);
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
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        return (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSelectItem(row.original)}
            title="View Chart"
            className="p-0 h-8 w-8"
          >
            <BarChart2 className="h-4 w-4" />
          </Button>
        );
      },
    },
  ];

  // Select columns based on data type
  const columns =
    dataType === "protocols"
      ? protocolColumns
      : dataType === "yields"
      ? yieldColumns
      : troveColumns;

  const table = useReactTable({
    data,
    columns,
    state: {
      expanded,
    },
    onExpandedChange: setExpanded,
    getSubRows: () => undefined, // We're handling expansion manually
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
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
                              `Transaction History for ${row.original.name}`}
                            {dataType === "yields" &&
                              `Transaction History for ${row.original.name} (${row.original.symbol})`}
                            {dataType === "troves" &&
                              `Transaction History for Trove ${row.original.id}`}
                          </h3>
                          {dataType === "protocols" && (
                            <ProtocolSubTable
                              transactions={row.original.transactions || []}
                              onSelectTransaction={(transaction) =>
                                onSelectItem(transaction)
                              }
                            />
                          )}
                          {dataType === "yields" && (
                            <YieldSubTable
                              transactions={row.original.transactions || []}
                              onSelectTransaction={(transaction) =>
                                onSelectItem(transaction)
                              }
                            />
                          )}
                          {dataType === "troves" && (
                            <TroveSubTable
                              transactions={row.original.transactions || []}
                              onSelectTransaction={(transaction) =>
                                onSelectItem(transaction)
                              }
                            />
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
