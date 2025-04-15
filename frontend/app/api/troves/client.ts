import { fetchApi } from "~/utils/async";
import { getTrovesPageData } from ".";
import { getProtocols } from "../shared";
import { useQuery } from "@tanstack/react-query";

export const useGetProtocols = () => {
  return useQuery({
    queryKey: ["getProtocols"],
    queryFn: () => getProtocols(),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: false,
  });
};

export const useGetTrovesData = (protocolInfo: any) => {
  return useQuery({
    queryKey: ["trovesPageData", protocolInfo?.protocolId],
    queryFn: () => getTrovesPageData(protocolInfo),
    staleTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
    enabled: !!protocolInfo?.protocolId, // Only run the query when protocolInfo is available
  });
};

// Define new types for the formatted data structure
interface FormattedTroveData {
  troveId: string;
  arrayIndex: number;
  lastDebtUpdateTime: string;
  lastInterestRateAdjTime: string;
  annualInterestRate: number; // Converted to percentage
  interestBatchManager: string;
  batchDebtShares: string;
  ownerAddress: string;
  debt: string;
  coll: string;
  stake: string;
  status: number;
  entire_debt: number; // Converted to human-readable format (divided by 1e18)
  accrued_interest: string;
  colRatio?: number; // Converted to percentage
  debtInFront?: number; // Converted to human-readable format (divided by 1e18)
  chain: string; // Add the chain to each trove
}

interface FormattedTroveManager {
  id: string;
  index: number;
  collateralSymbol: string;
  troveData: FormattedTroveData[];
  mcr: number; // Converted to percentage
  troveCount: number;
  currentDebtBold: string | null;
  currentColUSD: string | null;
  currentSpBold: string | null;
  currentSpColUsd: string | null;
  colRatio: number | null; // Converted to percentage
  currentColUSDOracle: string | null;
  currentColUSDPriceFeed: string | null;
}

interface FormattedProtocolData {
  id: string;
  name: string;
  displayName: string;
  chain: string;
  iconLink: string;
  url: string;
  troveManagers: FormattedTroveManager[];
}

export const formatTroveDataForUI = (data: any): FormattedProtocolData => {
  if (!data) return null;

  const { protocolInfo, chainData } = data;

  // Create an array to hold all formatted protocol data for all chains
  const formattedData: FormattedProtocolData = {
    id: `${protocolInfo.protocolId}-${Object.keys(chainData)[0]}`,
    name: protocolInfo.displayName || "",
    displayName: protocolInfo.name || "",
    chain: Object.keys(chainData)[0] || "",
    iconLink: protocolInfo.iconLink || "",
    url: protocolInfo.url || "",
    troveManagers: [],
  };

  // Process each chain
  Object.entries(chainData).forEach(([chainName, chainInfo]: [string, any]) => {
    // Process each trove manager in the chain
    if (chainInfo.troveManagers) {
      formattedData.troveManagers = Object.values(chainInfo.troveManagers)
        .map((tm: any) => {
          // Skip if there's no collateral info
          if (!tm.colImmutables) {
            return null;
          }

          const collTokenDecimals = parseInt(
            tm.colImmutables.collTokenDecimals || "18",
            10
          );
          const decimalsMultiplier = Math.pow(10, collTokenDecimals);

          // Format trove data with proper scaling and sorting
          const formattedTroveData = tm.troveData
            ? [...tm.troveData]
                .map((trove) => ({
                  ...trove,
                  chain: chainName, // Add the chain to each trove
                  annualInterestRate:
                    parseFloat(trove.annualInterestRate || "0") / 1e16, // Convert to percentage
                  entire_debt: parseFloat(trove.entire_debt || "0") / 1e18, // Convert to human-readable format
                  colRatio: trove.colRatio
                    ? parseFloat(String(trove.colRatio)) * 100
                    : null, // Format colRatio as percentage
                  coll: parseFloat(trove.coll || "0") / decimalsMultiplier, // Convert collateral to human-readable format
                  debtInFront: parseFloat(trove.debtInFront || "0") / 1e18, // Convert to human-readable format
                }))
                .sort(
                  (a, b) =>
                    parseFloat(b.annualInterestRate) -
                    parseFloat(a.annualInterestRate)
                )
            : [];

          // Format trove manager data
          return {
            id: `${tm.troveManagerIndex}-${chainName}`,
            index: tm.troveManagerIndex,
            collateralSymbol: tm.colImmutables.collTokenSymbol || "Unknown",
            troveData: formattedTroveData,
            mcr: parseFloat(tm.mcr || tm.colImmutables.MCR || "0") / 1e16, // Convert to percentage
            troveCount: tm.troveCount || 0,
            currentDebtBold: tm.currentDebtBold || null,
            currentCol: tm.currentCol || null,
            currentColUSD: tm.currentColUSD || null,
            currentSpBold: tm.currentSpBold || null,
            currentSpColUsd: tm.currentSpColUsd || null,
            colRatio: tm.colRatio ? parseFloat(tm.colRatio) * 100 : null, // Convert to percentage
            currentColUSDOracle: tm.currentColUSDOracle || null,
            currentColUSDPriceFeed: tm.currentColUSDPriceFeed || null,
            collTokenDecimals: collTokenDecimals,
          };
        })
        .filter(Boolean); // Filter out null values
    }
  });

  return formattedData;
};
