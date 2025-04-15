import type { Protocol } from "~/api/types";
import { formatTroveData } from "./utils";
import {
  PROTOCOL_CONFIG_API,
  POOL_DATA_CHART_API,
  LATEST_TROVE_DATA_API,
  EVENTS_API,
} from "~/constants";
import { fetchWithErrorLogging } from "~/utils/async";

const fetch = fetchWithErrorLogging;

const fetchWithRetries = async <T>(
  fetchFn: () => Promise<T>,
  errorMsg: string,
  maxRetries = 5
): Promise<T | null> => {
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const data = await fetchFn();
      if (data) {
        return data;
      }
    } catch (error) {}
    retryCount++;
    await new Promise((resolve) => setTimeout(resolve, 200 * retryCount));
  }

  if (retryCount === maxRetries) {
    console.warn(errorMsg);
    return null;
  }
};

export const getProtocols = async (protocolId?: number) => {
  fetch(PROTOCOL_CONFIG_API).then((r) => r.json());
  try {
    if (protocolId !== undefined) {
      return await fetch(
        `${PROTOCOL_CONFIG_API}?protocolId=${protocolId}`
      ).then((resp) => resp.json());
    } else {
      return await fetch(`${PROTOCOL_CONFIG_API}`).then((resp) => resp.json());
    }
  } catch (error) {
    console.error("Failed to fetch protocols:", error);
  }
};

const getLatestTroves = async (
  protocolId: number,
  chain: string,
  troveManagerIndex?: number,
  attachPoolData?: boolean
) => {
  let url = `${LATEST_TROVE_DATA_API}/${protocolId}/${chain}`;
  if (troveManagerIndex !== undefined) {
    url += `?troveManagerIndex=${troveManagerIndex}`;
  }
  if (attachPoolData) {
    url += (url.includes("?") ? "&" : "?") + "attachPoolData=true";
  }
  for (let i = 0; i < 5; i++) {
    try {
      return await fetch(url).then((resp) => resp.json());
    } catch (e) {}
  }
  throw new Error(`${url} is broken`);
};

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
  console.log("FORMATTED TROVE DATA:", formattedTroveData);
  return rawTroveData;
}
