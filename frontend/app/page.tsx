"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProtocolsPage } from "@/components/pages/protocols-page";
import { YieldsPage } from "@/components/pages/yields-page";
import { TrovesPage } from "@/components/pages/troves-page";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  const [currentPage, setCurrentPage] = useState("protocols");

  return (
    <div className="container py-6">
      <div className="flex flex-col items-start gap-4 mb-6">
        <div className="w-full flex justify-between items-center">
          <h1 className="text-2xl font-bold">Liquipeg</h1>
          <ThemeToggle />
        </div>
        <Tabs
          value={currentPage}
          onValueChange={setCurrentPage}
          className="w-full"
        >
          <TabsList className="grid w-full md:w-[400px] grid-cols-3">
            <TabsTrigger value="protocols">Protocols</TabsTrigger>
            <TabsTrigger value="yields">Yields</TabsTrigger>
            <TabsTrigger value="troves">Troves</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {currentPage === "protocols" && <ProtocolsPage />}
      {currentPage === "yields" && <YieldsPage />}
      {currentPage === "troves" && <TrovesPage />}
    </div>
  );
}
