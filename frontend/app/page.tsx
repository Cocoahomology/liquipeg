"use client";

import { useState, useCallback } from "react";
import { ProtocolsPage } from "@/components/pages/protocols-page";
import { YieldsPage } from "@/components/pages/yields-page";
import { TrovesPage } from "@/components/pages/troves-page";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getProtocolsOverviewPageData,
  fetchRawProtocolsData,
} from "@/app/api/protocols";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Home() {
  const [currentPage, setCurrentPage] = useState("protocols");
  const [loading, setLoading] = useState(false);
  const [changePeriod, setChangePeriod] = useState<
    "none" | "1d" | "7d" | "30d"
  >("1d"); // Default to 1d

  // Use useCallback to memoize the changePeriod handler
  const handleChangePeriod = useCallback(
    (value: "none" | "1d" | "7d" | "30d") => {
      setChangePeriod(value);
    },
    []
  );

  const handleTestClick = async () => {
    try {
      setLoading(true);
      console.log("Fetching protocol data...");
      const data = await getProtocolsOverviewPageData();
      //const data = await fetchRawProtocolsData();
      console.log("Protocol data:", data);
    } catch (error) {
      console.error("Error fetching protocol data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Simple header without sticky functionality */}
      <div className="w-full bg-background border-b py-6">
        <div className="container max-w-screen-xl mx-auto">
          <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
            {/* Left side with logo and tabs */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:flex-grow">
              <h1 className="text-2xl font-bold">Liquipeg</h1>

              <div className="flex flex-col sm:flex-row items-start sm:items-center w-full sm:flex-1">
                <div className="flex flex-col sm:flex-row items-start sm:items-center w-full">
                  <Tabs
                    value={currentPage}
                    onValueChange={setCurrentPage}
                    className="w-full sm:w-auto"
                  >
                    <TabsList className="grid w-full md:w-[400px] grid-cols-3">
                      <TabsTrigger value="protocols">Protocols</TabsTrigger>
                      <TabsTrigger value="yields" disabled className="relative">
                        Yields
                        <span className="absolute -top-1 right-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium">
                          Soon!
                        </span>
                      </TabsTrigger>
                      <TabsTrigger value="troves">Troves</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {currentPage === "protocols" && (
                    <div className="flex items-center gap-2 mt-4 sm:mt-0 sm:ml-4 whitespace-nowrap">
                      <span className="text-sm font-medium whitespace-nowrap">
                        % Change:
                      </span>
                      <Select
                        value={changePeriod}
                        onValueChange={handleChangePeriod}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Don't show</SelectItem>
                          <SelectItem value="1d">1d</SelectItem>
                          <SelectItem value="7d">7d</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/*}
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestClick}
                disabled={loading}
              >
                {loading ? "Loading..." : "Test API"}
              </Button>
              */}
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Content area with consistent padding */}
      <div className="container py-4">
        {currentPage === "protocols" && (
          <ProtocolsPage key="protocols" changePeriod={changePeriod} />
        )}
        {currentPage === "yields" && <YieldsPage key="yields" />}
        {currentPage === "troves" && <TrovesPage key="troves" />}
      </div>
    </>
  );
}
