"use client";
import { DashboardLayout } from "@/components/dashboard-layout";
import { generateProtocolsData } from "@/lib/dummy-data";

export function ProtocolsPage() {
  const protocolsData = generateProtocolsData();

  return (
    <div>
      <div className="mb-4"></div>
      <DashboardLayout data={protocolsData} />
    </div>
  );
}
