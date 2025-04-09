"use client";

import { useState, useEffect, useCallback } from "react";
import { ProtocolsPage } from "@/components/pages/protocols-page";
import { YieldsPage } from "@/components/pages/yields-page";
import { TrovesPage } from "@/components/pages/troves-page";
import { ThemeToggle } from "@/components/theme-toggle";
import { getProtocolsOverviewPageData } from "@/app/api/protocols";
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
  const [changePeriod, setChangePeriod] = useState("1d"); // Default to 1d
  const [isSticky, setIsSticky] = useState(false);

  // Use useCallback to memoize the changePeriod handler
  const handleChangePeriod = useCallback((value: string) => {
    setChangePeriod(value);
  }, []);

  // Handle scroll events to determine when to make the header sticky
  useEffect(() => {
    const handleScroll = () => {
      // Make header sticky after scrolling past a threshold
      const scrollThreshold = 100;
      setIsSticky(window.scrollY > scrollThreshold);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleTestClick = async () => {
    try {
      setLoading(true);
      console.log("Fetching protocol data...");
      const data = await getProtocolsOverviewPageData();
      console.log("Protocol data:", data);
    } catch (error) {
      console.error("Error fetching protocol data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Header with sticky functionality */}
      <div
        className={cn(
          "transition-all duration-200 ease-in-out w-full bg-background z-30",
          isSticky
            ? "fixed top-0 left-0 shadow-md py-2 px-4 border-b" // Increased from py-2 to py-3
            : "relative pt-6 pb-0" // Increased from py-2 to py-3 for more space above
        )}
      >
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

            {/* Right side with buttons only */}
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestClick}
                disabled={loading}
              >
                {loading ? "Loading..." : "Test API"}
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>
      {/* Add a smaller spacer when header becomes sticky */}
      {isSticky && <div className="h-16"></div>}{" "}
      {/* Increased from h-14 to h-16 */}
      {/* Content area - even less padding when not sticky */}
      <div className={cn("container", isSticky ? "py-3" : "pt-0 pb-4")}>
        {currentPage === "protocols" && (
          <ProtocolsPage key="protocols" changePeriod={changePeriod} />
        )}
        {currentPage === "yields" && <YieldsPage key="yields" />}
        {currentPage === "troves" && <TrovesPage key="troves" />}
      </div>
    </>
  );
}
