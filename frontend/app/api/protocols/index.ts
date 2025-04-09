import type { Protocol } from "~/api/types";
import { formatProtocolData } from "./utils";
import {
  PROTOCOL_CONFIG_API,
  POOL_DATA_CHART_API,
  LATEST_TROVE_DATA_API,
  EVENTS_API,
} from "~/constants";
import { fetchWithErrorLogging } from "~/utils/async";

const fetch = fetchWithErrorLogging;

export const getProtocols = () =>
  fetch(PROTOCOL_CONFIG_API).then((r) => r.json());

const getPoolDataChart = async (
  protocolId: number,
  chain: string,
  troveManagerIndex?: number
) => {
  for (let i = 0; i < 5; i++) {
    try {
      if (troveManagerIndex !== undefined) {
        return await fetch(
          `${POOL_DATA_CHART_API}/${protocolId}/${chain}?troveManagerIndex=${troveManagerIndex}`
        ).then((resp) => resp.json());
      } else {
        return await fetch(
          `${POOL_DATA_CHART_API}/${protocolId}/${chain}`
        ).then((resp) => resp.json());
      }
    } catch (e) {}
  }
  throw new Error(
    `${POOL_DATA_CHART_API}/${protocolId}/${chain}?troveManagerIndex=${troveManagerIndex} is broken`
  );
};

const getLatestTroves = async (
  protocolId: number,
  chain: string,
  troveManagerIndex?: number
) => {
  for (let i = 0; i < 5; i++) {
    try {
      if (troveManagerIndex !== undefined) {
        return await fetch(
          `${LATEST_TROVE_DATA_API}/${protocolId}/${chain}?troveManagerIndex=${troveManagerIndex}`
        ).then((resp) => resp.json());
      } else {
        return await fetch(
          `${LATEST_TROVE_DATA_API}/${protocolId}/${chain}`
        ).then((resp) => resp.json());
      }
    } catch (e) {}
  }
  throw new Error(
    `${LATEST_TROVE_DATA_API}/${protocolId}/${chain}?troveManagerIndex=${troveManagerIndex} is broken`
  );
};

const getEvents = async (
  protocolId: number,
  chain: string,
  troveManagerIndex?: number
) => {
  for (let i = 0; i < 5; i++) {
    try {
      if (troveManagerIndex !== undefined) {
        return await fetch(
          `${EVENTS_API}/${protocolId}/${chain}?troveManagerIndex=${troveManagerIndex}`
        ).then((resp) => resp.json());
      } else {
        return await fetch(`${EVENTS_API}/${protocolId}/${chain}`).then(
          (resp) => resp.json()
        );
      }
    } catch (e) {}
  }
  throw new Error(
    `${EVENTS_API}/${protocolId}/${chain}?troveManagerIndex=${troveManagerIndex} is broken`
  );
};

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

// Separate raw data fetching from formatting
export async function fetchRawProtocolsData() {
  const protocols = await getProtocols();

  // Will hold all the processed data grouped by protocol ID and chain
  const protocolDataByName = {};

  // Process each protocol
  const protocolResults = await Promise.allSettled(
    protocols.map(async (protocolData) => {
      const { protocolId, name, chains, immutables } = protocolData;

      // Create a copy of protocolData without troveManagers in immutables
      const protocolInfoCopy = { ...protocolData };

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

      // Use protocolId as key instead of name
      protocolDataByName[protocolId] = {
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
          protocolDataByName[protocolId].chainData[chainName] = {
            troveManagers: {},
          };

          // Process each trove manager for this chain (using the original immutables)
          const tmResults = await Promise.allSettled(
            chainImmutables.troveManagers.map(async ({ troveManagerIndex }) => {
              const poolDataChart = await fetchWithRetries(
                () =>
                  getPoolDataChart(protocolId, chainName, troveManagerIndex),
                `Failed to fetch pool data after 5 attempts for protocol ${protocolId}, chain ${chainName}, troveManager ${troveManagerIndex}`
              );

              if (!poolDataChart || !poolDataChart.poolDataByDay) {
                return;
              }

              const troveData = await fetchWithRetries(
                () => getLatestTroves(protocolId, chainName, troveManagerIndex),
                `Failed to fetch trove data after 5 attempts for protocol ${protocolId}, chain ${chainName}, troveManager ${troveManagerIndex}`
              );

              const eventData = await fetchWithRetries(
                () => getEvents(protocolId, chainName, troveManagerIndex),
                `Failed to fetch event data after 5 attempts for protocol ${protocolId}, chain ${chainName}, troveManager ${troveManagerIndex}`
              );

              const poolDataPoints = [];
              const priceDataPoints = [];

              poolDataChart.poolDataByDay.forEach((dayData) => {
                const { date, timestamp, poolData, priceData } = dayData;

                if (poolData) {
                  poolDataPoints.push({
                    date,
                    timestamp,
                    ...poolData,
                  });
                }

                if (priceData) {
                  priceDataPoints.push({
                    date,
                    timestamp,
                    ...priceData,
                  });
                }
              });

              // Process troveData to only keep required fields
              const processedTroveData = troveData
                ? troveData.map((entry) => ({
                    troveManagerIndex: entry.troveManagerIndex,
                    troveData: entry.troveData,
                  }))
                : null;

              // Store as object with troveManagerIndex as key
              protocolDataByName[protocolId].chainData[chainName].troveManagers[
                troveManagerIndex
              ] = {
                troveManagerIndex,
                poolDataPoints,
                priceDataPoints,
                colImmutables:
                  chainImmutables.troveManagers.find(
                    (tm) => tm.troveManagerIndex === troveManagerIndex
                  )?.colImmutables || {},
                troveData: processedTroveData,
                eventData: eventData,
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
    })
  );

  // Log any protocol processing failures
  protocolResults.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(`Protocol processing failed:`, result.reason);
    }
  });

  return protocolDataByName;
}

export async function getProtocolsOverviewPageData() {
  const protocolDataByName = await fetchRawProtocolsData();
  const formattedProtocolData = formatProtocolData(protocolDataByName);
  return formattedProtocolData;
}
