"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface CollateralFilterProps {
  collaterals: string[];
  selectedCollaterals: string[];
  onSelectionChange: (selectedCollaterals: string[]) => void;
  className?: string;
}

export function CollateralFilter({
  collaterals,
  selectedCollaterals,
  onSelectionChange,
  className,
}: CollateralFilterProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredCollaterals = collaterals.filter((collateral) =>
    collateral.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleCollateral = (collateral: string) => {
    if (selectedCollaterals.includes(collateral)) {
      onSelectionChange(selectedCollaterals.filter((c) => c !== collateral));
    } else {
      onSelectionChange([...selectedCollaterals, collateral]);
    }
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between relative", className)}
        >
          <span className="truncate">
            {selectedCollaterals.length > 0
              ? `${selectedCollaterals.length} collateral${
                  selectedCollaterals.length > 1 ? "s" : ""
                } selected`
              : "Select collateral..."}
          </span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {selectedCollaterals.length > 0 && (
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal h-5 flex items-center"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAll();
                }}
              >
                <span className="text-xs">{selectedCollaterals.length}</span>
                <X className="ml-1 h-3 w-3" />
              </Badge>
            )}
            <Search className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <div className="p-2 border-b">
          <input
            type="text"
            placeholder="Search collateral..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-2 border-none outline-none bg-transparent"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {filteredCollaterals.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              No collateral found.
            </div>
          ) : (
            <>
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-8"
                  onClick={clearAll}
                >
                  Clear all
                </Button>
              </div>

              <div className="space-y-1 p-1">
                {filteredCollaterals.map((collateral) => (
                  <div
                    key={collateral}
                    className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer"
                    onClick={() => toggleCollateral(collateral)}
                  >
                    <div
                      className="w-4 h-4 border border-primary rounded-sm flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCollateral(collateral);
                      }}
                    >
                      {selectedCollaterals.includes(collateral) && (
                        <div className="w-2 h-2 bg-primary rounded-sm" />
                      )}
                    </div>
                    <span className="flex-1">{collateral}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
