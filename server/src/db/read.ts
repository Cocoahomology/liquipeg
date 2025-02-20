import { eq, desc, and, sql } from "drizzle-orm";
import { CoreImmutables, TroveDataEntry, CorePoolDataEntry } from "../utils/types";
import {
  protocols,
  coreImmutables,
  coreColImmutables,
  troveManagers,
  corePoolData,
  colPoolData,
  eventData,
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

      return {
        getTroveManagerIndex: tm.troveManagerIndex,
        CCR: colImmutable.CCR,
        SCR: colImmutable.SCR,
        MCR: colImmutable.MCR,
        troveManager: colImmutable.troveManager,
        collToken: colImmutable.collToken,
        activePool: colImmutable.activePool,
        defaultPool: colImmutable.defaultPool,
        stabilityPool: colImmutable.stabilityPool,
        borrowerOperationsAddress: colImmutable.borrowerOperationsAddress,
        sortedTroves: colImmutable.sortedTroves,
        troveNFT: colImmutable.troveNFT,
        priceFeed: colImmutable.priceFeed,
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
