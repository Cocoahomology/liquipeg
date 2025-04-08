import { eq, asc, desc, and, sql, gte, lte, Param, not } from "drizzle-orm";
import { blockTimestamps, hourlyTroveDataSummary } from "../db/schema";
import { ChainApi } from "@defillama/sdk";
import { CoreImmutables, TroveDataEntry, CorePoolDataEntry, RecordedBlocksEntryWithChain } from "../utils/types";
import { ErrorLoggerService } from "../utils/bunyan";
import {
  protocols,
  coreImmutables,
  coreColImmutables,
  troveManagers,
  corePoolData,
  colPoolData,
  eventData,
  recordedBlocks,
  pricesAndRates,
  troveManagerTimeSamplePoints,
  protocolTimeSamplePoints,
} from "./schema";
import db from "./db";
import { withDbError } from "../utils/dbWrapper";

async function getProtocol(protocolId: number, chain: string) {
  return withDbError(
    () =>
      db.query.protocols.findFirst({
        where: and(eq(protocols.protocolId, protocolId), eq(protocols.chain, chain)),
      }),
    { table: "protocols", chain, protocolId }
  );
}

export async function getTroveManagersForProtocol(protocolId: number, chain: string, troveManagerIndex?: number) {
  return withDbError(
    async () => {
      const protocol = await getProtocol(protocolId, chain);
      if (!protocol) return [];

      return db.query.troveManagers.findMany({
        where: and(
          eq(troveManagers.protocolPk, protocol.pk),
          ...([troveManagerIndex !== undefined && eq(troveManagers.troveManagerIndex, troveManagerIndex)].filter(
            Boolean
          ) as any[])
        ),
      });
    },
    { table: "troveManagers", chain, protocolId }
  );
}

export async function getLatestCoreImmutables(
  protocolId: number,
  chain: string,
  troveManagerIndex?: number
): Promise<CoreImmutables | null> {
  return withDbError(
    async () => {
      const protocol = await getProtocol(protocolId, chain);
      if (!protocol) return null;

      // Since we now have only one record per protocol, we can just get it directly
      const coreImmutable = await db.query.coreImmutables.findFirst({
        where: eq(coreImmutables.protocolPk, protocol.pk),
      });

      if (!coreImmutable) return null;

      const troveMgrs = await getTroveManagersForProtocol(protocolId, chain, troveManagerIndex);
      if (!troveMgrs.length) return null;

      const colImmutables = await Promise.all(
        troveMgrs.map((tm) =>
          withDbError(
            async () => {
              // Since we now have only one record per trove manager, we can just get it directly
              const colImmutable = await db.query.coreColImmutables.findFirst({
                where: eq(coreColImmutables.troveManagerPk, tm.pk),
              });

              if (!colImmutable) return null;

              const { pk, troveManagerPk, blockNumber, collAlternativeChainAddresses, ...colImmutableData } =
                colImmutable;
              return {
                troveManagerIndex: tm.troveManagerIndex,
                collAlternativeChainAddresses: collAlternativeChainAddresses as string[] | null,
                ...colImmutableData,
              };
            },
            { table: "coreColImmutables", chain, protocolId }
          )
        )
      );

      return {
        boldToken: coreImmutable.boldToken,
        boldTokenSymbol: coreImmutable.boldTokenSymbol,
        nativeToken: coreImmutable.nativeToken,
        collateralRegistry: coreImmutable.collateralRegistry,
        interestRouter: coreImmutable.interestRouter,
        coreCollateralImmutables: colImmutables.filter((ci): ci is NonNullable<typeof ci> => ci !== null),
      };
    },
    { table: "coreImmutables", chain, protocolId }
  );
}

export async function getLatestTroveDataEntries(protocolId: number, chain: string, troveManagerIndex?: number) {
  return withDbError(
    async () => {
      const protocol = await getProtocol(protocolId, chain);
      if (!protocol) return null;

      const troveMgrs = await getTroveManagersForProtocol(protocolId, chain, troveManagerIndex);
      if (!troveMgrs.length) return null;

      const troveDataByManager = await Promise.all(
        troveMgrs.map((tm) =>
          withDbError(
            async () => {
              const entries = (
                await db.execute(sql`
                WITH LatestTroves AS (
                  SELECT 
                    *,
                    ROW_NUMBER() OVER (
                      PARTITION BY trove_id 
                      ORDER BY block_number DESC
                    ) as rn
                  FROM trove_data 
                  WHERE trove_manager_pk = ${tm.pk}
                )
                SELECT * FROM LatestTroves WHERE rn = 1
              `)
              ).rows as unknown as any[];
              if (!entries.length) return null;

              // Get the highest block number
              const maxBlock = Math.max(...entries.map((e) => e.block_number));

              // Get timestamp for the max block number
              const blockTimestamp = await db.query.blockTimestamps.findFirst({
                where: and(eq(blockTimestamps.blockNumber, maxBlock), eq(blockTimestamps.chain, chain)),
              });

              const troveIds = entries.map((entry) => entry.trove_id);
              const latestOwners: Record<string, string> = {};

              const ownersData = (
                await db.execute(sql`
                WITH LatestOwners AS (
                  SELECT 
                    *,
                    ROW_NUMBER() OVER (
                      PARTITION BY trove_id 
                      ORDER BY block_number DESC
                    ) as rn
                  FROM trove_owners 
                  WHERE trove_manager_pk = ${tm.pk} AND trove_id =ANY(${new Param(troveIds)})
                )
                SELECT trove_id, owner_address FROM LatestOwners WHERE rn = 1
              `)
              ).rows as unknown as { trove_id: string; owner_address: string }[];

              ownersData.forEach((owner) => {
                latestOwners[owner.trove_id] = owner.owner_address;
              });

              const troveDataEntries = entries.map(
                ({
                  block_number,
                  pk,
                  trove_manager_pk,
                  rn,
                  trove_id: troveId,
                  array_index: arrayIndex,
                  last_debt_update_time: lastDebtUpdateTime,
                  last_interest_rate_adj_time: lastInterestRateAdjTime,
                  annual_interest_rate: annualInterestRate,
                  interest_batch_manager: interestBatchManager,
                  batch_debt_shares: batchDebtShares,
                  ...rest
                }) => ({
                  troveId,
                  arrayIndex,
                  lastDebtUpdateTime,
                  lastInterestRateAdjTime,
                  annualInterestRate,
                  interestBatchManager,
                  batchDebtShares,
                  ownerAddress: latestOwners[troveId] || null,
                  ...rest,
                })
              );

              return {
                protocolId: protocol.protocolId,
                troveManagerIndex: tm.troveManagerIndex,
                blockNumber: maxBlock,
                timestamp: blockTimestamp?.timestamp || null,
                chain,
                troveData: troveDataEntries,
              } as TroveDataEntry;
            },
            { table: "troveData", chain, protocolId }
          )
        )
      );

      return troveDataByManager.filter((td): td is NonNullable<typeof td> => td !== null);
    },
    { table: "troveData", chain, protocolId }
  );
}

export async function getLatestPoolDataEntries(
  protocolId: number,
  chain: string,
  troveManagerIndex?: number
): Promise<CorePoolDataEntry | null> {
  return withDbError(
    async () => {
      const protocol = await getProtocol(protocolId, chain);
      if (!protocol) return null;

      const latestCorePool = await db.query.corePoolData.findFirst({
        where: eq(corePoolData.protocolPk, protocol.pk),
        orderBy: [desc(corePoolData.blockNumber)],
      });

      if (!latestCorePool) return null;

      const troveMgrs = await getTroveManagersForProtocol(protocolId, chain, troveManagerIndex);
      if (!troveMgrs.length) return null;

      const latestColPool = await Promise.all(
        troveMgrs.map((tm) =>
          withDbError(
            async () => {
              const colPool = await db.query.colPoolData.findFirst({
                where: eq(colPoolData.troveManagerPk, tm.pk),
                orderBy: [desc(colPoolData.blockNumber)],
              });

              if (!colPool) return null;

              const { pk, troveManagerPk, blockNumber, ...formattedColPool } = colPool;

              return {
                troveManagerIndex: tm.troveManagerIndex,
                ...formattedColPool,
              };
            },
            { table: "colPoolData", chain, protocolId }
          )
        )
      );

      return {
        protocolId,
        chain,
        blockNumber: latestCorePool.blockNumber,
        baseRate: latestCorePool.baseRate,
        getRedemptionRate: latestCorePool.getRedemptionRate,
        totalCollaterals: latestCorePool.totalCollaterals,
        collateralPoolData: latestColPool.filter((cp): cp is NonNullable<typeof cp> => cp !== null),
      };
    },
    { table: "corePoolData", chain, protocolId }
  );
}

export async function getEventData(protocolId: number, chain: string, eventName?: string, troveManagerIndex?: number) {
  return withDbError(
    async () => {
      const protocol = await getProtocol(protocolId, chain);
      if (!protocol) return null;

      const baseQuery = db
        .select({
          troveManagerIndex: troveManagers.troveManagerIndex,
          blockNumber: eventData.blockNumber,
          txHash: eventData.txHash,
          logIndex: eventData.logIndex,
          eventName: eventData.eventName,
          operation: eventData.operation,
          eventData: eventData.eventData,
        })
        .from(eventData)
        .innerJoin(troveManagers, eq(eventData.troveManagerPk, troveManagers.pk))
        .innerJoin(protocols, eq(troveManagers.protocolPk, protocols.pk))
        .where(
          and(
            eq(protocols.protocolId, protocolId),
            eq(protocols.chain, chain),
            ...([
              eventName && eq(eventData.eventName, eventName),
              troveManagerIndex && eq(troveManagers.troveManagerIndex, troveManagerIndex),
            ].filter(Boolean) as any[])
          )
        )
        .orderBy(desc(eventData.blockNumber));

      return await baseQuery;
    },
    { table: "eventData", chain, protocolId }
  );
}

export async function getRecordedBlocksByProtocolId(protocolId: number): Promise<RecordedBlocksEntryWithChain[]> {
  return withDbError(
    async () => {
      return await db
        .select({
          protocolId: protocols.protocolId,
          startBlock: recordedBlocks.startBlock,
          endBlock: recordedBlocks.endBlock,
          chain: protocols.chain,
        })
        .from(recordedBlocks)
        .innerJoin(protocols, eq(recordedBlocks.protocolPk, protocols.pk))
        .where(eq(protocols.protocolId, protocolId));
    },
    { table: "recordedBlocks", protocolId }
  );
}

export async function getTroveManagerCollateralDetails(protocolId: number, chain: string) {
  return withDbError(
    async () => {
      const protocol = await getProtocol(protocolId, chain);
      if (!protocol) return [];

      const troveMgrs = await getTroveManagersForProtocol(protocolId, chain);
      const results = await Promise.all(
        troveMgrs.map((tm) =>
          withDbError(
            async () => {
              const colImmutable = await db.query.coreColImmutables.findFirst({
                where: eq(coreColImmutables.troveManagerPk, tm.pk),
                orderBy: [desc(coreColImmutables.blockNumber)],
              });

              if (!colImmutable) return null;

              return {
                troveManagerIndex: tm.troveManagerIndex,
                collToken: colImmutable.collToken,
                priceFeed: colImmutable.priceFeed,
              };
            },
            { table: "coreColImmutables", chain, protocolId }
          )
        )
      );

      return results.filter((r): r is NonNullable<typeof r> => r !== null);
    },
    { table: "coreColImmutables", chain, protocolId }
  );
}

export async function getBlocksWithMissingTimestamps(): Promise<
  Record<
    string,
    {
      pk: number;
      blockNumber: number;
      timestamp: number | null;
      timestampMissing: boolean;
      chain: string;
    }[]
  >
> {
  return withDbError(
    async () => {
      const blocks = await db
        .select()
        .from(blockTimestamps)
        .where(eq(blockTimestamps.timestampMissing, true))
        .orderBy(asc(blockTimestamps.blockNumber));

      // Group blocks by chain
      return blocks.reduce((acc, block) => {
        if (!acc[block.chain]) {
          acc[block.chain] = [];
        }
        acc[block.chain].push(block);
        return acc;
      }, {} as Record<string, (typeof blockTimestamps.$inferSelect)[]>);
    },
    { table: "blockTimestamps" }
  );
}

export async function getLatestPricesAndRates(protocolId: number, chain: string, troveManagerIndex?: number) {
  return withDbError(
    async () => {
      const protocol = await getProtocol(protocolId, chain);
      if (!protocol) return null;

      const troveMgrs = await getTroveManagersForProtocol(protocolId, chain, troveManagerIndex);
      if (!troveMgrs.length) return null;

      const latestPricesAndRates = await Promise.all(
        troveMgrs.map((tm) =>
          withDbError(
            async () => {
              const priceData = await db
                .select({
                  pk: pricesAndRates.pk,
                  troveManagerPk: pricesAndRates.troveManagerPk,
                  blockNumber: pricesAndRates.blockNumber,
                  colUSDPriceFeed: pricesAndRates.colUSDPriceFeed,
                  colUSDOracle: pricesAndRates.colUSDOracle,
                  LSTUnderlyingCanonicalRate: pricesAndRates.LSTUnderlyingCanonicalRate,
                  LSTUnderlyingMarketRate: pricesAndRates.LSTUnderlyingMarketRate,
                  underlyingUSDOracle: pricesAndRates.underlyingUSDOracle,
                  deviation: pricesAndRates.deviation,
                  redemptionRelatedOracles: pricesAndRates.redemptionRelatedOracles,
                  timestamp: blockTimestamps.timestamp,
                })
                .from(pricesAndRates)
                .where(eq(pricesAndRates.troveManagerPk, tm.pk))
                .leftJoin(
                  blockTimestamps,
                  and(eq(blockTimestamps.blockNumber, pricesAndRates.blockNumber), eq(blockTimestamps.chain, chain))
                )
                .orderBy(desc(pricesAndRates.blockNumber))
                .limit(1)
                .then((rows) => rows[0]);

              if (!priceData) return null;

              const { pk, troveManagerPk, timestamp, ...formattedPriceData } = priceData;

              return {
                troveManagerIndex: tm.troveManagerIndex,
                timestamp,
                ...formattedPriceData,
              };
            },
            { table: "pricesAndRates", chain, protocolId }
          )
        )
      );

      const filteredPrices = latestPricesAndRates.filter((pr): pr is NonNullable<typeof pr> => pr !== null);
      if (filteredPrices.length === 0) return null;

      return {
        protocolId,
        chain,
        pricesAndRatesData: filteredPrices,
      };
    },
    { table: "pricesAndRates", chain, protocolId }
  );
}

export async function getEventsWithTimestamps(
  protocolId: number,
  chain: string,
  operations?: number[],
  eventNamesToFetch?: string[],
  troveManagerIndex?: number
) {
  return withDbError(
    async () => {
      const protocol = await getProtocol(protocolId, chain);
      if (!protocol) return null;

      const conditions = [
        eq(protocols.protocolId, protocolId),
        eq(protocols.chain, chain),
        ...(eventNamesToFetch ? [sql`${eventData.eventName} = ANY(${new Param(eventNamesToFetch)})`] : []),
        ...(operations ? [sql`${eventData.operation} = ANY(${new Param(operations)})`] : []),
        ...(troveManagerIndex !== undefined ? [eq(troveManagers.troveManagerIndex, troveManagerIndex)] : []),
      ];

      const events = await db
        .select({
          blockNumber: eventData.blockNumber,
          timestamp: blockTimestamps.timestamp,
          protocolId: protocols.protocolId,
          chain: protocols.chain,
          eventName: eventData.eventName,
          eventData: eventData.eventData,
          troveManagerIndex: troveManagers.troveManagerIndex,
          txHash: eventData.txHash,
          operation: eventData.operation,
        })
        .from(eventData)
        .innerJoin(troveManagers, eq(eventData.troveManagerPk, troveManagers.pk))
        .innerJoin(protocols, eq(troveManagers.protocolPk, protocols.pk))
        .leftJoin(
          blockTimestamps,
          and(eq(blockTimestamps.blockNumber, eventData.blockNumber), eq(blockTimestamps.chain, protocols.chain))
        )
        .where(and(...conditions))
        .orderBy(desc(eventData.blockNumber));

      const groupedEvents = events.reduce((acc, event) => {
        const { blockNumber, timestamp } = event;
        if (!acc[blockNumber]) {
          acc[blockNumber] = {
            blockNumber,
            timestamp,
            events: [],
          };
        }

        acc[blockNumber].events.push({
          chain: event.chain,
          protocolId: event.protocolId,
          txHash: event.txHash,
          troveManagerIndex: event.troveManagerIndex,
          operation: event.operation,
          eventName: event.eventName,
          eventData: event.eventData,
        });

        return acc;
      }, {} as Record<number, { blockNumber: number; timestamp: number | null; events: any[] }>);

      return Object.values(groupedEvents);
    },
    { table: "eventData", chain, protocolId }
  );
}

export async function getProtocolDetails(protocolId: number) {
  return withDbError(
    async () => {
      const protocolEntries = await db.query.protocols.findMany({
        where: eq(protocols.protocolId, protocolId),
      });

      if (!protocolEntries.length) return null;

      const name = protocolEntries[0].name;

      const chains = protocolEntries.map((p) => p.chain);

      const immutables: Record<string, any> = {};

      for (const protocol of protocolEntries) {
        const chain = protocol.chain;

        const coreImmutableData = await db.query.coreImmutables.findFirst({
          where: eq(coreImmutables.protocolPk, protocol.pk),
        });

        const troveMgrs = await getTroveManagersForProtocol(protocolId, chain);

        const troveManagersWithCollateral = [];

        for (const tm of troveMgrs) {
          const colImmutable = await db.query.coreColImmutables.findFirst({
            where: eq(coreColImmutables.troveManagerPk, tm.pk),
          });

          if (colImmutable) {
            const { pk, troveManagerPk, blockNumber, ...colImmutableData } = colImmutable;

            troveManagersWithCollateral.push({
              troveManagerIndex: tm.troveManagerIndex,
              colImmutables: {
                ...colImmutableData,
                collAlternativeChainAddresses: colImmutableData.collAlternativeChainAddresses as string[] | null,
              },
            });
          }
        }

        if (coreImmutableData) {
          immutables[chain] = {
            boldToken: coreImmutableData.boldToken,
            collateralRegistry: coreImmutableData.collateralRegistry,
            interestRouter: coreImmutableData.interestRouter,
            troveManagers: troveManagersWithCollateral,
          };
        }
      }

      return {
        protocolId,
        name,
        chains,
        immutables,
      };
    },
    { table: "protocols", protocolId }
  );
}

export async function getDailyPricesAndRates(
  protocolId: number,
  chain: string,
  troveManagerIndex: number,
  startTimestamp?: number,
  endTimestamp?: number,
  replaceLastEntryWithHourly: boolean = false
) {
  return withDbError(
    async () => {
      const protocol = await getProtocol(protocolId, chain);
      if (!protocol) return null;

      let queryStartTimestamp: number;
      let queryEndTimestamp: number = endTimestamp ?? Math.floor(Date.now() / 1000);

      // If no startTimestamp provided, get the earliest sample point timestamp
      if (startTimestamp === undefined) {
        const earliestSample = await db
          .select({ targetTimestamp: troveManagerTimeSamplePoints.targetTimestamp })
          .from(troveManagerTimeSamplePoints)
          .where(eq(troveManagerTimeSamplePoints.chain, chain))
          .orderBy(asc(troveManagerTimeSamplePoints.targetTimestamp))
          .limit(1);

        if (!earliestSample.length) return null;
        queryStartTimestamp = earliestSample[0].targetTimestamp;
      } else {
        queryStartTimestamp = startTimestamp;
      }

      const troveMgrs = await getTroveManagersForProtocol(protocolId, chain, troveManagerIndex);
      if (!troveMgrs.length) return null;

      const troveMgr = troveMgrs[0];

      // Get all sample dates for this trove manager
      const uniqueDates = await db
        .selectDistinct({
          timestamp: troveManagerTimeSamplePoints.targetTimestamp,
          date: troveManagerTimeSamplePoints.date,
        })
        .from(troveManagerTimeSamplePoints)
        .where(
          and(
            eq(troveManagerTimeSamplePoints.chain, chain),
            eq(troveManagerTimeSamplePoints.troveManagerPk, troveMgr.pk),
            eq(troveManagerTimeSamplePoints.hour, 0), // Only get daily points
            gte(troveManagerTimeSamplePoints.targetTimestamp, queryStartTimestamp),
            lte(troveManagerTimeSamplePoints.targetTimestamp, queryEndTimestamp)
          )
        )
        .orderBy(asc(troveManagerTimeSamplePoints.targetTimestamp));

      // Get all sample points for this trove manager within the timestamp range
      const samplePoints = await db
        .select({
          timestamp: troveManagerTimeSamplePoints.targetTimestamp,
          date: troveManagerTimeSamplePoints.date,
          pricesAndRatesBlockNumber: troveManagerTimeSamplePoints.pricesAndRatesBlockNumber,
        })
        .from(troveManagerTimeSamplePoints)
        .where(
          and(
            eq(troveManagerTimeSamplePoints.troveManagerPk, troveMgr.pk),
            eq(troveManagerTimeSamplePoints.hour, 0), // Only get daily points
            gte(troveManagerTimeSamplePoints.targetTimestamp, queryStartTimestamp),
            lte(troveManagerTimeSamplePoints.targetTimestamp, queryEndTimestamp)
          )
        )
        .orderBy(asc(troveManagerTimeSamplePoints.targetTimestamp));

      // Filter out sample points without block numbers
      const validSamplePoints = samplePoints.filter((sample) => sample.pricesAndRatesBlockNumber !== null);
      if (validSamplePoints.length === 0) {
        return {
          protocolId,
          chain,
          troveManagerIndex,
          dates: uniqueDates,
          priceData: {},
        };
      }

      const blockNumbers = validSamplePoints.map((sample) => sample.pricesAndRatesBlockNumber as number);

      const allPriceData = await db
        .select({
          blockNumber: pricesAndRates.blockNumber,
          colUSDPriceFeed: pricesAndRates.colUSDPriceFeed,
          colUSDOracle: pricesAndRates.colUSDOracle,
          LSTUnderlyingCanonicalRate: pricesAndRates.LSTUnderlyingCanonicalRate,
          LSTUnderlyingMarketRate: pricesAndRates.LSTUnderlyingMarketRate,
          underlyingUSDOracle: pricesAndRates.underlyingUSDOracle,
          deviation: pricesAndRates.deviation,
          redemptionRelatedOracles: pricesAndRates.redemptionRelatedOracles,
          timestamp: blockTimestamps.timestamp,
        })
        .from(pricesAndRates)
        .where(
          and(
            eq(pricesAndRates.troveManagerPk, troveMgr.pk),
            sql`${pricesAndRates.blockNumber} = ANY(${new Param(blockNumbers)})`
          )
        )
        .leftJoin(
          blockTimestamps,
          and(eq(blockTimestamps.blockNumber, pricesAndRates.blockNumber), eq(blockTimestamps.chain, chain))
        );

      // Create a lookup map for fast access
      const priceDataByBlock: Record<number, any> = {};
      allPriceData.forEach((priceData) => {
        priceDataByBlock[priceData.blockNumber] = priceData;
      });

      // Create a mapping of timestamp to price data for easier lookup
      const priceDataByTimestamp: Record<number, any> = {};
      validSamplePoints.forEach((sample) => {
        const { timestamp } = sample;
        const blockNumber = sample.pricesAndRatesBlockNumber as number;
        const priceData = priceDataByBlock[blockNumber];
        if (priceData) {
          priceDataByTimestamp[timestamp] = priceData;
        }
      });

      // If replaceLastEntryWithHourly is true, find and replace the most recent daily entry with the most recent hourly entry
      if (replaceLastEntryWithHourly && uniqueDates.length > 0) {
        const latestHourlySample = await db
          .select({
            targetTimestamp: troveManagerTimeSamplePoints.targetTimestamp,
            date: troveManagerTimeSamplePoints.date,
            hour: troveManagerTimeSamplePoints.hour,
            pricesAndRatesBlockNumber: troveManagerTimeSamplePoints.pricesAndRatesBlockNumber,
          })
          .from(troveManagerTimeSamplePoints)
          .where(and(eq(troveManagerTimeSamplePoints.troveManagerPk, troveMgr.pk)))
          .orderBy(desc(troveManagerTimeSamplePoints.targetTimestamp))
          .limit(1);

        if (latestHourlySample.length > 0 && latestHourlySample[0].pricesAndRatesBlockNumber) {
          const samplePoint = latestHourlySample[0];
          const blockNumber = samplePoint.pricesAndRatesBlockNumber as number;

          if (blockNumber !== null) {
            const hourlySamplePriceData = await db
              .select({
                blockNumber: pricesAndRates.blockNumber,
                colUSDPriceFeed: pricesAndRates.colUSDPriceFeed,
                colUSDOracle: pricesAndRates.colUSDOracle,
                LSTUnderlyingCanonicalRate: pricesAndRates.LSTUnderlyingCanonicalRate,
                LSTUnderlyingMarketRate: pricesAndRates.LSTUnderlyingMarketRate,
                underlyingUSDOracle: pricesAndRates.underlyingUSDOracle,
                deviation: pricesAndRates.deviation,
                redemptionRelatedOracles: pricesAndRates.redemptionRelatedOracles,
                timestamp: blockTimestamps.timestamp,
              })
              .from(pricesAndRates)
              .where(
                and(
                  eq(pricesAndRates.blockNumber, blockNumber),
                  eq(pricesAndRates.troveManagerPk, troveMgr.pk) // Add filter for specific trove manager
                )
              )
              .leftJoin(
                blockTimestamps,
                and(eq(blockTimestamps.blockNumber, pricesAndRates.blockNumber), eq(blockTimestamps.chain, chain))
              )
              .limit(1);

            if (hourlySamplePriceData.length > 0) {
              const latestTimestamp = uniqueDates[uniqueDates.length - 1].timestamp;
              // Keep the same timestamp but replace the data
              priceDataByTimestamp[latestTimestamp] = hourlySamplePriceData[0];
            }
          }
        }
      }

      return {
        protocolId,
        chain,
        troveManagerIndex,
        dates: uniqueDates,
        priceData: priceDataByTimestamp,
      };
    },
    { table: "troveManagerTimeSamplePoints", chain, protocolId }
  );
}

export async function getDailyPoolData(
  protocolId: number,
  chain: string,
  troveManagerIndex?: number,
  startTimestamp?: number,
  endTimestamp?: number,
  replaceLastEntryWithHourly: boolean = false
) {
  return withDbError(
    async () => {
      const protocol = await getProtocol(protocolId, chain);
      if (!protocol) return null;

      let queryStartTimestamp: number;
      let queryEndTimestamp: number = endTimestamp ?? Math.floor(Date.now() / 1000);

      if (troveManagerIndex !== undefined) {
        // Trove manager specific query for colPoolData
        const troveMgrs = await getTroveManagersForProtocol(protocolId, chain, troveManagerIndex);
        if (!troveMgrs.length) return null;

        const troveMgr = troveMgrs[0];

        // If no startTimestamp provided, get the earliest sample point timestamp
        if (startTimestamp === undefined) {
          const earliestSample = await db
            .select({ targetTimestamp: troveManagerTimeSamplePoints.targetTimestamp })
            .from(troveManagerTimeSamplePoints)
            .where(eq(troveManagerTimeSamplePoints.chain, chain))
            .orderBy(asc(troveManagerTimeSamplePoints.targetTimestamp))
            .limit(1);

          if (!earliestSample.length) return null;
          queryStartTimestamp = earliestSample[0].targetTimestamp;
        } else {
          queryStartTimestamp = startTimestamp;
        }

        // Get all sample dates for this trove manager
        const uniqueDates = await db
          .selectDistinct({
            timestamp: troveManagerTimeSamplePoints.targetTimestamp,
            date: troveManagerTimeSamplePoints.date,
          })
          .from(troveManagerTimeSamplePoints)
          .where(
            and(
              eq(troveManagerTimeSamplePoints.chain, chain),
              eq(troveManagerTimeSamplePoints.troveManagerPk, troveMgr.pk),
              eq(troveManagerTimeSamplePoints.hour, 0), // Only get daily points
              gte(troveManagerTimeSamplePoints.targetTimestamp, queryStartTimestamp),
              lte(troveManagerTimeSamplePoints.targetTimestamp, queryEndTimestamp)
            )
          )
          .orderBy(asc(troveManagerTimeSamplePoints.targetTimestamp));

        // Get all sample points for this trove manager within the timestamp range
        const samplePoints = await db
          .select({
            timestamp: troveManagerTimeSamplePoints.targetTimestamp,
            date: troveManagerTimeSamplePoints.date,
            colPoolDataBlockNumber: troveManagerTimeSamplePoints.colPoolDataBlockNumber,
            pricesAndRatesBlockNumber: troveManagerTimeSamplePoints.pricesAndRatesBlockNumber,
          })
          .from(troveManagerTimeSamplePoints)
          .where(
            and(
              eq(troveManagerTimeSamplePoints.troveManagerPk, troveMgr.pk),
              eq(troveManagerTimeSamplePoints.hour, 0), // Only get daily points
              gte(troveManagerTimeSamplePoints.targetTimestamp, queryStartTimestamp),
              lte(troveManagerTimeSamplePoints.targetTimestamp, queryEndTimestamp)
            )
          )
          .orderBy(asc(troveManagerTimeSamplePoints.targetTimestamp));

        // Filter out sample points without block numbers for pool data
        const validPoolSamplePoints = samplePoints.filter((sample) => sample.colPoolDataBlockNumber !== null);

        const poolResult = {
          protocolId,
          chain,
          troveManagerIndex,
          dates: uniqueDates,
          poolData: {} as Record<number, any>,
          priceData: {} as Record<number, any>,
        };

        if (validPoolSamplePoints.length === 0) {
          return poolResult;
        }

        const poolBlockNumbers = validPoolSamplePoints.map((sample) => sample.colPoolDataBlockNumber as number);

        // Query colPoolData for the selected block numbers
        const allPoolData = await db
          .select()
          .from(colPoolData)
          .where(
            and(
              eq(colPoolData.troveManagerPk, troveMgr.pk),
              sql`${colPoolData.blockNumber} = ANY(${new Param(poolBlockNumbers)})`
            )
          );

        // Create a lookup map for fast access
        const poolDataByBlock: Record<number, any> = {};
        allPoolData.forEach((data) => {
          const { pk, troveManagerPk, ...formattedData } = data;
          poolDataByBlock[data.blockNumber] = formattedData;
        });

        // Create a mapping of timestamp to pool data for easier lookup
        const poolDataByTimestamp: Record<number, any> = {};
        validPoolSamplePoints.forEach((sample) => {
          const { timestamp } = sample;
          const blockNumber = sample.colPoolDataBlockNumber as number;
          const data = poolDataByBlock[blockNumber];
          if (data) {
            poolDataByTimestamp[timestamp] = data;
          }
        });

        // Now get the price data if available
        const validPriceSamplePoints = samplePoints.filter((sample) => sample.pricesAndRatesBlockNumber !== null);

        if (validPriceSamplePoints.length > 0) {
          const priceBlockNumbers = validPriceSamplePoints.map((sample) => sample.pricesAndRatesBlockNumber as number);

          // Query pricesAndRates for the selected block numbers
          const allPriceData = await db
            .select({
              blockNumber: pricesAndRates.blockNumber,
              colUSDPriceFeed: pricesAndRates.colUSDPriceFeed,
              colUSDOracle: pricesAndRates.colUSDOracle,
              LSTUnderlyingCanonicalRate: pricesAndRates.LSTUnderlyingCanonicalRate,
              LSTUnderlyingMarketRate: pricesAndRates.LSTUnderlyingMarketRate,
              underlyingUSDOracle: pricesAndRates.underlyingUSDOracle,
              deviation: pricesAndRates.deviation,
              redemptionRelatedOracles: pricesAndRates.redemptionRelatedOracles,
              timestamp: blockTimestamps.timestamp,
            })
            .from(pricesAndRates)
            .where(
              and(
                eq(pricesAndRates.troveManagerPk, troveMgr.pk),
                sql`${pricesAndRates.blockNumber} = ANY(${new Param(priceBlockNumbers)})`
              )
            )
            .leftJoin(
              blockTimestamps,
              and(eq(blockTimestamps.blockNumber, pricesAndRates.blockNumber), eq(blockTimestamps.chain, chain))
            );

          // Create a lookup map for fast access
          const priceDataByBlock: Record<number, any> = {};
          allPriceData.forEach((data) => {
            priceDataByBlock[data.blockNumber] = data;
          });

          // Create a mapping of timestamp to price data for easier lookup
          const priceDataByTimestamp: Record<number, any> = {};
          validPriceSamplePoints.forEach((sample) => {
            const { timestamp } = sample;
            const blockNumber = sample.pricesAndRatesBlockNumber as number;
            const data = priceDataByBlock[blockNumber];
            if (data) {
              priceDataByTimestamp[timestamp] = data;
            }
          });

          poolResult.priceData = priceDataByTimestamp;
        }

        // If replaceLastEntryWithHourly is true, find and replace the most recent daily entry
        if (replaceLastEntryWithHourly && uniqueDates.length > 0) {
          const latestHourlySample = await db
            .select({
              targetTimestamp: troveManagerTimeSamplePoints.targetTimestamp,
              date: troveManagerTimeSamplePoints.date,
              hour: troveManagerTimeSamplePoints.hour,
              colPoolDataBlockNumber: troveManagerTimeSamplePoints.colPoolDataBlockNumber,
              pricesAndRatesBlockNumber: troveManagerTimeSamplePoints.pricesAndRatesBlockNumber,
            })
            .from(troveManagerTimeSamplePoints)
            .where(and(eq(troveManagerTimeSamplePoints.troveManagerPk, troveMgr.pk)))
            .orderBy(desc(troveManagerTimeSamplePoints.targetTimestamp))
            .limit(1);

          if (latestHourlySample.length > 0) {
            const samplePoint = latestHourlySample[0];
            const latestTimestamp = uniqueDates[uniqueDates.length - 1].timestamp;

            // Handle pool data update if block number exists
            if (samplePoint.colPoolDataBlockNumber) {
              const blockNumber = samplePoint.colPoolDataBlockNumber as number;
              const hourlySamplePoolData = await db
                .select()
                .from(colPoolData)
                .where(and(eq(colPoolData.blockNumber, blockNumber), eq(colPoolData.troveManagerPk, troveMgr.pk)))
                .limit(1);

              if (hourlySamplePoolData.length > 0) {
                const { pk, troveManagerPk, ...formattedData } = hourlySamplePoolData[0];
                poolDataByTimestamp[latestTimestamp] = formattedData;
              }
            }

            // Handle price data update if block number exists
            if (samplePoint.pricesAndRatesBlockNumber && poolResult.priceData) {
              const blockNumber = samplePoint.pricesAndRatesBlockNumber as number;
              const hourlySamplePriceData = await db
                .select({
                  blockNumber: pricesAndRates.blockNumber,
                  colUSDPriceFeed: pricesAndRates.colUSDPriceFeed,
                  colUSDOracle: pricesAndRates.colUSDOracle,
                  LSTUnderlyingCanonicalRate: pricesAndRates.LSTUnderlyingCanonicalRate,
                  LSTUnderlyingMarketRate: pricesAndRates.LSTUnderlyingMarketRate,
                  underlyingUSDOracle: pricesAndRates.underlyingUSDOracle,
                  deviation: pricesAndRates.deviation,
                  redemptionRelatedOracles: pricesAndRates.redemptionRelatedOracles,
                  timestamp: blockTimestamps.timestamp,
                })
                .from(pricesAndRates)
                .where(and(eq(pricesAndRates.blockNumber, blockNumber), eq(pricesAndRates.troveManagerPk, troveMgr.pk)))
                .leftJoin(
                  blockTimestamps,
                  and(eq(blockTimestamps.blockNumber, pricesAndRates.blockNumber), eq(blockTimestamps.chain, chain))
                )
                .limit(1);

              if (hourlySamplePriceData.length > 0) {
                (poolResult.priceData as Record<number, any>)[latestTimestamp] = hourlySamplePriceData[0];
              }
            }
          }
        }

        poolResult.poolData = poolDataByTimestamp;
        return poolResult;
      } else {
        // Protocol level query for corePoolData
        // If no startTimestamp provided, get the earliest sample point timestamp
        if (startTimestamp === undefined) {
          const earliestSample = await db
            .select({ targetTimestamp: protocolTimeSamplePoints.targetTimestamp })
            .from(protocolTimeSamplePoints)
            .where(eq(protocolTimeSamplePoints.chain, chain))
            .orderBy(asc(protocolTimeSamplePoints.targetTimestamp))
            .limit(1);

          if (!earliestSample.length) return null;
          queryStartTimestamp = earliestSample[0].targetTimestamp;
        } else {
          queryStartTimestamp = startTimestamp;
        }

        // Get all sample dates for this protocol
        const uniqueDates = await db
          .selectDistinct({
            timestamp: protocolTimeSamplePoints.targetTimestamp,
            date: protocolTimeSamplePoints.date,
          })
          .from(protocolTimeSamplePoints)
          .where(
            and(
              eq(protocolTimeSamplePoints.chain, chain),
              eq(protocolTimeSamplePoints.protocolPk, protocol.pk),
              eq(protocolTimeSamplePoints.hour, 0), // Only get daily points
              gte(protocolTimeSamplePoints.targetTimestamp, queryStartTimestamp),
              lte(protocolTimeSamplePoints.targetTimestamp, queryEndTimestamp)
            )
          )
          .orderBy(asc(protocolTimeSamplePoints.targetTimestamp));

        // Get all sample points for this protocol within the timestamp range
        const samplePoints = await db
          .select({
            timestamp: protocolTimeSamplePoints.targetTimestamp,
            date: protocolTimeSamplePoints.date,
            corePoolDataBlockNumber: protocolTimeSamplePoints.corePoolDataBlockNumber,
          })
          .from(protocolTimeSamplePoints)
          .where(
            and(
              eq(protocolTimeSamplePoints.protocolPk, protocol.pk),
              eq(protocolTimeSamplePoints.hour, 0), // Only get daily points
              gte(protocolTimeSamplePoints.targetTimestamp, queryStartTimestamp),
              lte(protocolTimeSamplePoints.targetTimestamp, queryEndTimestamp)
            )
          )
          .orderBy(asc(protocolTimeSamplePoints.targetTimestamp));

        // Filter out sample points without block numbers
        const validSamplePoints = samplePoints.filter((sample) => sample.corePoolDataBlockNumber !== null);
        if (validSamplePoints.length === 0) {
          return {
            protocolId,
            chain,
            dates: uniqueDates,
            poolData: {},
          };
        }

        const blockNumbers = validSamplePoints.map((sample) => sample.corePoolDataBlockNumber as number);

        // Query corePoolData for the selected block numbers
        const allPoolData = await db
          .select()
          .from(corePoolData)
          .where(
            and(
              eq(corePoolData.protocolPk, protocol.pk),
              sql`${corePoolData.blockNumber} = ANY(${new Param(blockNumbers)})`
            )
          );

        // Create a lookup map for fast access
        const poolDataByBlock: Record<number, any> = {};
        allPoolData.forEach((data) => {
          const { pk, protocolPk, totalCollaterals, ...formattedData } = data;
          poolDataByBlock[data.blockNumber] = formattedData;
        });

        // Create a mapping of timestamp to pool data for easier lookup
        const poolDataByTimestamp: Record<number, any> = {};
        validSamplePoints.forEach((sample) => {
          const { timestamp } = sample;
          const blockNumber = sample.corePoolDataBlockNumber as number;
          const data = poolDataByBlock[blockNumber];
          if (data) {
            poolDataByTimestamp[timestamp] = data;
          }
        });

        // If replaceLastEntryWithHourly is true, find and replace the most recent daily entry
        if (replaceLastEntryWithHourly && uniqueDates.length > 0) {
          const latestHourlySample = await db
            .select({
              targetTimestamp: protocolTimeSamplePoints.targetTimestamp,
              date: protocolTimeSamplePoints.date,
              hour: protocolTimeSamplePoints.hour,
              corePoolDataBlockNumber: protocolTimeSamplePoints.corePoolDataBlockNumber,
            })
            .from(protocolTimeSamplePoints)
            .where(and(eq(protocolTimeSamplePoints.protocolPk, protocol.pk)))
            .orderBy(desc(protocolTimeSamplePoints.targetTimestamp))
            .limit(1);

          if (latestHourlySample.length > 0 && latestHourlySample[0].corePoolDataBlockNumber) {
            const samplePoint = latestHourlySample[0];
            const blockNumber = samplePoint.corePoolDataBlockNumber as number;

            if (blockNumber !== null) {
              const hourlySamplePoolData = await db
                .select()
                .from(corePoolData)
                .where(and(eq(corePoolData.blockNumber, blockNumber), eq(corePoolData.protocolPk, protocol.pk)))
                .limit(1);

              if (hourlySamplePoolData.length > 0) {
                const latestTimestamp = uniqueDates[uniqueDates.length - 1].timestamp;

                const { pk, protocolPk, totalCollaterals, ...formattedData } = hourlySamplePoolData[0];
                poolDataByTimestamp[latestTimestamp] = formattedData;
              }
            }
          }
        }

        return {
          protocolId,
          chain,
          dates: uniqueDates,
          poolData: poolDataByTimestamp,
        };
      }
    },
    { table: troveManagerIndex !== undefined ? "colPoolData" : "corePoolData", chain, protocolId }
  );
}

export async function getDailyTroveDataSummaries(
  protocolId: number,
  chain: string,
  troveManagerIndex: number,
  startTimestamp?: number,
  endTimestamp?: number,
  replaceLastEntryWithHourly: boolean = false
) {
  return withDbError(
    async () => {
      const protocol = await getProtocol(protocolId, chain);
      if (!protocol) return null;

      const troveMgrs = await getTroveManagersForProtocol(protocolId, chain, troveManagerIndex);
      if (!troveMgrs.length) return null;

      const troveMgr = troveMgrs[0];

      let queryEndTimestamp: number = endTimestamp ?? Math.floor(Date.now() / 1000);
      let queryStartTimestamp: number;

      // If no startTimestamp provided, get the earliest hourly trove data summary timestamp
      if (startTimestamp === undefined) {
        const earliestSummary = await db
          .select({ targetTimestamp: hourlyTroveDataSummary.targetTimestamp })
          .from(hourlyTroveDataSummary)
          .where(
            and(
              eq(hourlyTroveDataSummary.troveManagerPk, troveMgr.pk),
              eq(hourlyTroveDataSummary.hour, 0) // Only daily entries
            )
          )
          .orderBy(asc(hourlyTroveDataSummary.targetTimestamp))
          .limit(1);

        if (!earliestSummary.length) return null;
        queryStartTimestamp = earliestSummary[0].targetTimestamp;
      } else {
        queryStartTimestamp = startTimestamp;
      }

      // Get all daily trove data summaries for this trove manager within the time range
      const dailySummaries = await db
        .select({
          date: hourlyTroveDataSummary.date,
          targetTimestamp: hourlyTroveDataSummary.targetTimestamp,
          avgInterestRate: hourlyTroveDataSummary.avgInterestRate,
          colRatio: hourlyTroveDataSummary.colRatio,
          statusCounts: hourlyTroveDataSummary.statusCounts,
          totalTroves: hourlyTroveDataSummary.totalTroves,
        })
        .from(hourlyTroveDataSummary)
        .where(
          and(
            eq(hourlyTroveDataSummary.troveManagerPk, troveMgr.pk),
            eq(hourlyTroveDataSummary.hour, 0), // Only daily entries
            gte(hourlyTroveDataSummary.targetTimestamp, queryStartTimestamp),
            lte(hourlyTroveDataSummary.targetTimestamp, queryEndTimestamp)
          )
        )
        .orderBy(asc(hourlyTroveDataSummary.targetTimestamp));

      // Format data for response
      const formattedDates = dailySummaries.map((summary) => ({
        date: summary.date,
        timestamp: summary.targetTimestamp,
      }));

      // Create a mapping of timestamp to summary data for easier lookup
      const summaryDataByTimestamp: Record<number, any> = {};
      dailySummaries.forEach((summary) => {
        const { targetTimestamp, date, ...summaryData } = summary;
        summaryDataByTimestamp[targetTimestamp] = summaryData;
      });

      // If replaceLastEntryWithHourly is true, find and replace the most recent daily entry with the most recent hourly entry
      if (replaceLastEntryWithHourly && formattedDates.length > 0) {
        const latestHourlySummary = await db
          .select({
            date: hourlyTroveDataSummary.date,
            hour: hourlyTroveDataSummary.hour,
            targetTimestamp: hourlyTroveDataSummary.targetTimestamp,
            avgInterestRate: hourlyTroveDataSummary.avgInterestRate,
            colRatio: hourlyTroveDataSummary.colRatio,
            statusCounts: hourlyTroveDataSummary.statusCounts,
            totalTroves: hourlyTroveDataSummary.totalTroves,
          })
          .from(hourlyTroveDataSummary)
          .where(
            and(
              eq(hourlyTroveDataSummary.troveManagerPk, troveMgr.pk),
              not(eq(hourlyTroveDataSummary.hour, 0)) // Only hourly entries (not daily)
            )
          )
          .orderBy(desc(hourlyTroveDataSummary.targetTimestamp))
          .limit(1);

        if (latestHourlySummary.length > 0) {
          const latestHourly = latestHourlySummary[0];
          const latestDailyTimestamp = formattedDates[formattedDates.length - 1].timestamp;

          // Keep the original daily timestamp but update the data
          const { targetTimestamp, date, hour, ...hourlyData } = latestHourly;
          summaryDataByTimestamp[latestDailyTimestamp] = hourlyData;
        }
      }

      return {
        protocolId,
        chain,
        troveManagerIndex,
        dates: formattedDates,
        summaryData: summaryDataByTimestamp,
      };
    },
    { table: "hourlyTroveDataSummary", chain, protocolId }
  );
}
