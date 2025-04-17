import { formatProtocolData } from "./utils";
import { fetchWithRetries } from "~/utils/async";
import {
  getProtocols,
  getPoolDataChart,
  getLatestTroves,
  getEvents,
} from "../shared";

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
                  getPoolDataChart(
                    protocolId,
                    chainName,
                    troveManagerIndex,
                    true
                  ),
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
                () => getEvents(protocolId, chainName, troveManagerIndex, true),
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

              // Process troveData to only keep the troveData array directly
              const processedTroveData = troveData
                ? troveData.find(
                    (entry) => entry.troveManagerIndex === troveManagerIndex
                  )?.troveData || []
                : [];

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
