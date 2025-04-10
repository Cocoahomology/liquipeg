import { fetchApi } from "~/utils/async";
import { getProtocolsOverviewPageData } from ".";
import { useQuery } from "@tanstack/react-query";

// New query function for protocols data with 10 minute cache
export const useGetProtocolsOverviewData = () => {
  return useQuery({
    queryKey: ["protocolsOverviewData"],
    queryFn: () => getProtocolsOverviewPageData(),
    staleTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
  });
};

// Helper function to format protocol data for the UI
export const formatProtocolDataForUI = (data) => {
  if (!data) return [];

  const formatted = [];

  Object.keys(data).forEach((protocolId) => {
    const protocol = data[protocolId];
    const { protocolInfo, chainData } = protocol;

    Object.keys(chainData).forEach((chain) => {
      const chainInfo = chainData[chain];

      // Format protocol level redemption total by dividing by 1e18
      const prev7DayProtocolRedemptionTotal =
        chainInfo.prev7DayProtocolRedemptionTotal
          ? parseFloat(chainInfo.prev7DayProtocolRedemptionTotal) / 1e18
          : 0;

      // Create formatted protocol object with only the essential data needed for the UI
      const formattedProtocol = {
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
        prev7DayProtocolRedemptionTotal: prev7DayProtocolRedemptionTotal,
        iconLink: protocolInfo.iconLink || "",
        url: protocolInfo.url || "",
        troveManagers: chainInfo.troveManagers
          ? Object.values(chainInfo.troveManagers)
              .map((tm) => formatTroveManagerForUI(tm, protocolId, chain))
              .filter(Boolean)
          : {},
      };

      // Sort troveManagers by TVL in descending order
      if (
        Array.isArray(formattedProtocol.troveManagers) &&
        formattedProtocol.troveManagers.length
      ) {
        formattedProtocol.troveManagers.sort((a, b) => b.tvl - a.tvl);
      }

      formatted.push(formattedProtocol);
    });
  });

  return formatted;
};

// Extract trove manager formatting to a separate function
function formatTroveManagerForUI(tm, protocolId, chain) {
  // Skip trove managers with insufficient data
  if (!tm.colImmutables || !tm.currentColUSD) {
    return null;
  }

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

  // Format prev7DayRedemptionTotal - divide by 1e18 as requested
  const prev7DayRedemptionTotal = tm.prev7DayRedemptionTotal
    ? parseFloat(tm.prev7DayRedemptionTotal) / 1e18
    : 0;

  // Only include properties needed for the UI to reduce unnecessary conversions
  return {
    id: `${protocolId}-${chain}`,
    index: tm.troveManagerIndex,
    collateralSymbol: tm.colImmutables.collTokenSymbol || "Unknown",
    tvl: parseFloat(tm.currentColUSD || "0"),
    prevDayTvl: tm.prevDayColUSD ? parseFloat(tm.prevDayColUSD) : null,
    prev7DayTvl: tm.prev7DayColUSD ? parseFloat(tm.prev7DayColUSD) : null,
    tvlChange1d: tm.tvlChange1d !== undefined ? tm.tvlChange1d : null,
    tvlChange7d: tm.tvlChange7d !== undefined ? tm.tvlChange7d : null,
    collateralRatio: parseFloat(tm.colRatio || "0") * 100,
    prevDayCollateralRatio: tm.prevDayColRatio
      ? parseFloat(tm.prevDayColRatio) * 100
      : null,
    prev7DayCollateralRatio: tm.prev7DayColRatio
      ? parseFloat(tm.prev7DayColRatio) * 100
      : null,
    collateralRatioChange1d: tm.collateralRatioChange1d,
    collateralRatioChange7d: tm.collateralRatioChange7d,
    ratioSettings: `${ccr}/${mcr}/${scr}`,
    ccr: ccr,
    currentColUSDOracle: tm.currentColUSDOracle || "",
    prevDayColUSDOracle: tm.prevDayColUSDOracle || null,
    prev7DayColUSDOracle: tm.prev7DayColUSDOracle || null,
    colUSDOracleChange1d: tm.colUSDOracleChange1d,
    colUSDOracleChange7d: tm.colUSDOracleChange7d,
    avgIR: tm.avgIR || "",
    minIR: tm.minIR || "",
    maxLiqPrice: tm.maxLiqPrice || "",
    prev7DayRedemptionTotal: prev7DayRedemptionTotal,
  };
}
