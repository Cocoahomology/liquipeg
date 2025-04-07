"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ProtocolComboboxProps {
  protocols: string[];
  selectedProtocol: string | null;
  onSelect: (protocol: string) => void;
  className?: string;
}

export function ProtocolCombobox({
  protocols,
  selectedProtocol,
  onSelect,
  className,
}: ProtocolComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");

  const filteredProtocols = protocols.filter((protocol) =>
    protocol.toLowerCase().includes(searchValue.toLowerCase())
  );

  const handleSelect = React.useCallback(
    (value: string) => {
      onSelect(value);
      setOpen(false);
      setSearchValue("");
    },
    [onSelect]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {selectedProtocol ? selectedProtocol : "Select protocol..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <div className="p-2 border-b">
          <input
            type="text"
            placeholder="Search protocol..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full p-2 border-none outline-none bg-transparent"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {filteredProtocols.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              No protocol found.
            </div>
          ) : (
            <div className="space-y-1 p-1">
              {filteredProtocols.map((protocol) => (
                <div
                  key={protocol}
                  className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer"
                  onClick={() => handleSelect(protocol)}
                >
                  <Check
                    className={cn(
                      "h-4 w-4",
                      selectedProtocol === protocol
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  <span className="flex-1">{protocol}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
