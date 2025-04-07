"use client";
import { DashboardLayout } from "@/components/dashboard-layout";
import { generateYieldsData } from "@/lib/dummy-data";

export function YieldsPage() {
  const yieldsData = generateYieldsData();

  return (
    <div>
      <div className="mb-4"></div>
      <DashboardLayout data={yieldsData} />
    </div>
  );
}
