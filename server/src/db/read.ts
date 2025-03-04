import { eq, asc, desc, and, sql, gte, lte } from "drizzle-orm";
import { blockTimestamps } from "../db/schema";
import { ChainApi } from "@defillama/sdk";
import { CoreImmutables, TroveDataEntry, CorePoolDataEntry, RecordedBlocksEntryWithChain } from "../utils/types";
import {
  protocols,
  coreImmutables,
  coreColImmutables,
  troveManagers,
  corePoolData,
  colPoolData,
  eventData,
  recordedBlocks,
} from "./schema";
import db from "./db";

async function getProtocol(protocolId: number, chain: string) {
  return await db.query.protocols.findFirst({
    where: and(eq(protocols.protocolId, protocolId), eq(protocols.chain, chain)),
  });
}

async function getTroveManagersForProtocol(protocolId: number, chain: string, troveManagerIndex?: number) {
  const protocol = await getProtocol(protocolId, chain);
  if (!protocol) return [];

  return await db.query.troveManagers.findMany({
    where: and(
      eq(troveManagers.protocolPk, protocol.pk),
      ...([troveManagerIndex !== undefined && eq(troveManagers.troveManagerIndex, troveManagerIndex)].filter(
        Boolean
      ) as any[])
    ),
  });
}

export async function getLatestCoreImmutables(
  protocolId: number,
  chain: string,
  troveManagerIndex?: number
): Promise<CoreImmutables | null> {
  const protocol = await getProtocol(protocolId, chain);
  if (!protocol) return null;

  const latestCoreImmutable = await db.query.coreImmutables.findFirst({
    where: eq(coreImmutables.protocolPk, protocol.pk),
    orderBy: [desc(coreImmutables.blockNumber)],
  });

  if (!latestCoreImmutable) return null;

  const troveMgrs = await getTroveManagersForProtocol(protocolId, chain, troveManagerIndex);
  if (!troveMgrs.length) return null;

  const latestColImmutables = await Promise.all(
    troveMgrs.map(async (tm) => {
      const colImmutable = await db.query.coreColImmutables.findFirst({
        where: eq(coreColImmutables.troveManagerPk, tm.pk),
        orderBy: [desc(coreColImmutables.blockNumber)],
      });

      if (!colImmutable) return null;

      const { pk, troveManagerPk, blockNumber, collAlternativeChainAddresses, ...colImmutableData } = colImmutable;
      return {
        getTroveManagerIndex: tm.troveManagerIndex,
        collAlternativeChainAddresses: collAlternativeChainAddresses as { [chain: string]: string[] } | null,
        ...colImmutableData,
      };
    })
  );

  return {
    boldToken: latestCoreImmutable.boldToken,
    collateralRegistry: latestCoreImmutable.collateralRegistry,
    interestRouter: latestCoreImmutable.interestRouter,
    coreCollateralImmutables: latestColImmutables.filter((ci): ci is NonNullable<typeof ci> => ci !== null),
  };
}

export async function getLatestTroveDataEntries(protocolId: number, chain: string, troveManagerIndex?: number) {
  const protocol = await getProtocol(protocolId, chain);
  if (!protocol) return null;

  const troveMgrs = await getTroveManagersForProtocol(protocolId, chain, troveManagerIndex);
  if (!troveMgrs.length) return null;

  // window function for performance
  const troveDataByManager = await Promise.all(
    troveMgrs.map(async (tm) => {
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

      // Transform entries by removing internal fields, fix snake case from raw sql result
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
          ...rest,
        })
      );

      return {
        protocolId: protocol.protocolId,
        getTroveManagerIndex: tm.troveManagerIndex,
        blockNumber: maxBlock,
        chain,
        troveData: troveDataEntries,
      } as TroveDataEntry;
    })
  );

  return troveDataByManager.filter((td): td is NonNullable<typeof td> => td !== null);
}

export async function getLatestPoolDataEntries(
  protocolId: number,
  chain: string,
  troveManagerIndex?: number
): Promise<CorePoolDataEntry | null> {
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
    troveMgrs.map(async (tm) => {
      const colPool = await db.query.colPoolData.findFirst({
        where: eq(colPoolData.troveManagerPk, tm.pk),
        orderBy: [desc(colPoolData.blockNumber)],
      });

      if (!colPool) return null;

      const { pk, troveManagerPk, blockNumber, ...formattedColPool } = colPool;

      return {
        getTroveManagerIndex: tm.troveManagerIndex,
        ...formattedColPool,
      };
    })
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
}

export async function getEventData(protocolId: number, chain: string, eventName?: string, troveManagerIndex?: number) {
  const protocol = await getProtocol(protocolId, chain);
  if (!protocol) return null;

  const baseQuery = db
    .select({
      troveManagerIndex: troveManagers.troveManagerIndex,
      blockNumber: eventData.blockNumber,
      txHash: eventData.txHash,
      logIndex: eventData.logIndex,
      eventName: eventData.eventName,
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
}

export async function getRecordedBlocksByProtocolId(protocolId: number): Promise<RecordedBlocksEntryWithChain[]> {
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
}

export async function getTroveManagerCollateralDetails(protocolId: number, chain: string) {
  const protocol = await getProtocol(protocolId, chain);
  if (!protocol) return [];

  const troveMgrs = await getTroveManagersForProtocol(protocolId, chain);
  const results = await Promise.all(
    troveMgrs.map(async (tm) => {
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
    })
  );

  return results.filter((r): r is NonNullable<typeof r> => r !== null);
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
}
