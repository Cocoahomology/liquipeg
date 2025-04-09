"use client";
import { DashboardLayout } from "@/components/dashboard-layout";
import { getProtocolsOverviewPageData } from "@/app/api/protocols";
import { useState, useEffect } from "react";

// Interface for our formatted protocol data
interface FormattedProtocolData {
  id: string;
  name: string;
  chain: string;
  tvl: number;
  tvlChange1d: number | null;
  tvlChange7d: number | null;
  collateralRatio: number;
  collateralRatioChange1d: number | null;
  collateralRatioChange7d: number | null;
  stableDebt: number;
  stableDebtChange1d: number | null;
  stableDebtChange7d: number | null;
  spTvl: number;
  spTvlChange1d: number | null;
  spTvlChange7d: number | null;
  troveManagers: {
    index: number;
    collateralSymbol: string;
    tvl: number;
    prevDayTvl: number | null; // Added 1-day previous TVL
    prev7DayTvl: number | null; // Added 7-day previous TVL
    tvlChange1d: number | null; // Added 1-day TVL change
    tvlChange7d: number | null; // Added 7-day TVL change
    collateralRatio: number;
    prevDayCollateralRatio: number | null; // Added 1-day previous collateral ratio
    prev7DayCollateralRatio: number | null; // Added 7-day previous collateral ratio
    collateralRatioChange1d: number | null; // Added 1-day collateral ratio change
    collateralRatioChange7d: number | null; // Added 7-day collateral ratio change
    ratioSettings: string;
    currentColUSDOracle: string | number;
    prevDayColUSDOracle: string | number | null; // Added 1-day previous oracle price
    prev7DayColUSDOracle: string | number | null; // Added 7-day previous oracle price
    colUSDOracleChange1d: number | null; // Added 1-day oracle price change
    colUSDOracleChange7d: number | null; // Added 7-day oracle price change
    avgIR?: string | number;
    minIR?: string | number;
    maxLiqPrice?: string | number;
  }[];
  displayName: string;
  iconLink: string;
  url: string;
}

interface ProtocolsPageProps {
  changePeriod: string;
}

export function ProtocolsPage({ changePeriod = "1d" }: ProtocolsPageProps) {
  const [protocolsData, setProtocolsData] = useState(null);
  const [formattedData, setFormattedData] = useState<FormattedProtocolData[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const data = await getProtocolsOverviewPageData();
      setProtocolsData(data);

      // Format the data for our table
      if (data) {
        const formatted: FormattedProtocolData[] = [];

        Object.keys(data).forEach((protocolId) => {
          const protocol = data[protocolId];
          const { protocolInfo, chainData } = protocol;

          Object.keys(chainData).forEach((chain) => {
            const chainInfo = chainData[chain];

            const formattedProtocol: FormattedProtocolData = {
              id: `${protocolId}-${chain}`,
              name: protocolInfo.displayName || protocolInfo.name,
              displayName: protocolInfo.name,
              chain: chain,
              tvl: parseFloat(chainInfo.currentProtocolTvl || "0"),
              tvlChange1d: chainInfo.tvlChange1d
                ? parseFloat(chainInfo.tvlChange1d)
                : null,
              tvlChange7d: chainInfo.tvlChange7d
                ? parseFloat(chainInfo.tvlChange7d)
                : null,
              collateralRatio:
                parseFloat(chainInfo.currentProtocolColRatio || "0") * 100,
              collateralRatioChange1d: chainInfo.colRatioChange1d
                ? parseFloat(chainInfo.colRatioChange1d)
                : null,
              collateralRatioChange7d: chainInfo.colRatioChange7d
                ? parseFloat(chainInfo.colRatioChange7d)
                : null,
              stableDebt: parseFloat(chainInfo.currentProtocolDebtBold || "0"),
              stableDebtChange1d: chainInfo.debtBoldChange1d
                ? parseFloat(chainInfo.debtBoldChange1d)
                : null,
              stableDebtChange7d: chainInfo.debtBoldChange7d
                ? parseFloat(chainInfo.debtBoldChange7d)
                : null,
              spTvl: parseFloat(chainInfo.currentProtocolSpTvl || "0"),
              spTvlChange1d: chainInfo.spTvlChange1d
                ? parseFloat(chainInfo.spTvlChange1d)
                : null,
              spTvlChange7d: chainInfo.spTvlChange7d
                ? parseFloat(chainInfo.spTvlChange7d)
                : null,
              troveManagers: chainInfo.troveManagers.map((tm) => {
                // Process CCR, MCR, SCR values
                const ccr = tm.colImmutables.CCR
                  ? Math.floor(parseFloat(tm.colImmutables.CCR) / 10 ** 16)
                  : 0;
                const mcr = tm.colImmutables.MCR
                  ? Math.floor(parseFloat(tm.colImmutables.MCR) / 10 ** 16)
                  : 0;
                const scr = tm.colImmutables.SCR
                  ? Math.floor(parseFloat(tm.colImmutables.SCR) / 10 ** 16)
                  : 0;

                // Create the concatenated ratio settings string
                const ratioSettings = `${ccr}/${mcr}/${scr}`;

                // Use the values that are already calculated in the API
                return {
                  index: tm.troveManagerIndex,
                  collateralSymbol: tm.colImmutables.collTokenSymbol,
                  tvl: parseFloat(tm.currentColUSD || "0"),
                  prevDayTvl: tm.prevDayColUSD
                    ? parseFloat(tm.prevDayColUSD)
                    : null,
                  prev7DayTvl: tm.prev7DayColUSD
                    ? parseFloat(tm.prev7DayColUSD)
                    : null,
                  tvlChange1d:
                    tm.tvlChange1d !== undefined ? tm.tvlChange1d : null,
                  tvlChange7d:
                    tm.tvlChange7d !== undefined ? tm.tvlChange7d : null,
                  collateralRatio: parseFloat(tm.colRatio || "0") * 100,
                  prevDayCollateralRatio: tm.prevDayColRatio
                    ? parseFloat(tm.prevDayColRatio) * 100
                    : null,
                  prev7DayCollateralRatio: tm.prev7DayColRatio
                    ? parseFloat(tm.prev7DayColRatio) * 100
                    : null,
                  collateralRatioChange1d:
                    tm.collateralRatioChange1d !== undefined
                      ? tm.collateralRatioChange1d
                      : null,
                  collateralRatioChange7d:
                    tm.collateralRatioChange7d !== undefined
                      ? tm.collateralRatioChange7d
                      : null,
                  ratioSettings: ratioSettings,
                  currentColUSDOracle: tm.currentColUSDOracle || "",
                  prevDayColUSDOracle: tm.prevDayColUSDOracle || null,
                  prev7DayColUSDOracle: tm.prev7DayColUSDOracle || null,
                  colUSDOracleChange1d:
                    tm.colUSDOracleChange1d !== undefined
                      ? tm.colUSDOracleChange1d
                      : null,
                  colUSDOracleChange7d:
                    tm.colUSDOracleChange7d !== undefined
                      ? tm.colUSDOracleChange7d
                      : null,
                  avgIR: tm.avgIR || "",
                  minIR: tm.minIR || "",
                  maxLiqPrice: tm.maxLiqPrice || "",
                };
              }),
              iconLink: protocolInfo.iconLink || "",
              url: protocolInfo.url || "",
            };

            // Sort troveManagers by TVL in descending order
            formattedProtocol.troveManagers.sort((a, b) => b.tvl - a.tvl);

            formatted.push(formattedProtocol);
          });
        });

        setFormattedData(formatted);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div className="mb-4"></div>
      <DashboardLayout
        data={formattedData}
        customTitle="Protocol Analytics"
        changePeriod={changePeriod}
      />
    </div>
  );
}
