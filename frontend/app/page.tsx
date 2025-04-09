"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProtocolsPage } from "@/components/pages/protocols-page";
import { YieldsPage } from "@/components/pages/yields-page";
import { TrovesPage } from "@/components/pages/troves-page";
import { ThemeToggle } from "@/components/theme-toggle";
import { getProtocolsOverviewPageData } from "@/app/api/protocols";
import { Button } from "@/components/ui/button";
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
    <div className="container py-6">
      <div className="flex flex-col items-start gap-4 mb-6">
        <div className="w-full flex justify-between items-center">
          <h1 className="text-2xl font-bold">Liquipeg</h1>
          <div className="flex items-center gap-2">
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
        <div className="w-full flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4">
            <Tabs
              value={currentPage}
              onValueChange={setCurrentPage}
              className="flex-grow"
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
              <div className="flex items-center gap-2 justify-start">
                <span className="text-sm font-medium">% Change:</span>
                <Select value={changePeriod} onValueChange={setChangePeriod}>
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

      {currentPage === "protocols" && (
        <ProtocolsPage changePeriod={changePeriod} />
      )}
      {currentPage === "yields" && <YieldsPage />}
      {currentPage === "troves" && <TrovesPage />}
    </div>
  );
}
