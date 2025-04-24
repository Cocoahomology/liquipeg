import { getLatestTroves } from "../shared";
import { formatTroveData } from "./utils";
import { fetchWithRetries } from "~/utils/async";

// Separate raw data fetching from formatting
export async function fetchRawTroveDataForProtocol(protocol: any) {
  const { protocolId, chains, immutables } = protocol;

  // Create a copy of protocolData without troveManagers in immutables
  const protocolInfoCopy = { ...protocol };

  // Remove troveManagers from immutables in the copy
  if (protocolInfoCopy.immutables) {
    protocolInfoCopy.immutables = Object.fromEntries(
      Object.entries(protocolInfoCopy.immutables).map(
        ([chainName, chainData]) => {
          if (chainData && typeof chainData === "object") {
            const { troveManagers, ...rest } = chainData as {
              troveManagers?: any;
              [key: string]: any;
            };
            return [chainName, rest];
          }
          return [chainName, chainData];
        }
      )
    );
  }

  const rawTroveData = {
    protocolInfo: protocolInfoCopy,
    chainData: {},
  };

  // Process each chain for this protocol
  const chainResults = await Promise.allSettled(
    chains.map(async (chainName) => {
      const chainImmutables = immutables[chainName];

      if (!chainImmutables || !chainImmutables.troveManagers) {
        return;
      }

      // Initialize the chain data structure with troveManagers as object
      rawTroveData.chainData[chainName] = {
        troveManagers: {},
      };

      // Process each trove manager for this chain (using the original immutables)
      const tmResults = await Promise.allSettled(
        chainImmutables.troveManagers.map(async ({ troveManagerIndex }) => {
          const troveData = await fetchWithRetries(
            () =>
              getLatestTroves(protocolId, chainName, troveManagerIndex, true),
            `Failed to fetch trove data after 5 attempts for protocol ${protocolId}, chain ${chainName}, troveManager ${troveManagerIndex}`
          );

          const troveManagerEntry = troveData
            ? troveData.find(
                (entry) => entry.troveManagerIndex === troveManagerIndex
              )
            : null;

          // Extract data from the entry
          const processedTroveData = troveManagerEntry?.troveData || [];
          const pricesAndRatesData = troveManagerEntry?.pricesAndRates || [];
          const poolData = troveManagerEntry?.poolData || [];

          // Store as object with troveManagerIndex as key
          rawTroveData.chainData[chainName].troveManagers[troveManagerIndex] = {
            troveManagerIndex,
            colImmutables:
              chainImmutables.troveManagers.find(
                (tm) => tm.troveManagerIndex === troveManagerIndex
              )?.colImmutables || {},
            troveData: processedTroveData,
            latestPricesAndRates: pricesAndRatesData,
            latestPoolData: poolData,
          };
        })
      );

      // Log any failures for debugging but continue processing
      tmResults.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn(`Trove manager processing failed:`, result.reason);
        }
      });
    })
  );

  // Log any chain processing failures for debugging
  chainResults.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(`Chain processing failed:`, result.reason);
    }
  });

  return rawTroveData;
}

export async function getTrovesPageData(protocolInfo: any) {
  const rawTroveData = await fetchRawTroveDataForProtocol(protocolInfo);
  const formattedTroveData = formatTroveData(rawTroveData);
  // console.log("FORMATTED TROVE DATA:", formattedTroveData);
  // FIX: is this not incorrect?
  return rawTroveData;
}
