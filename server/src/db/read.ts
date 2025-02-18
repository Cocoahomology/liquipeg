import { eq, desc, and, sql, InferSelectModel } from "drizzle-orm";
import { CoreImmutables } from "../utils/types";
import { protocols, coreImmutables, coreColImmutables, troveManagers, troveData } from "./schema";
import db from "./db";

type TroveDataRow = InferSelectModel<typeof troveData> & { rn: number };

async function getProtocol(protocolId: number, chain: string) {
  return await db.query.protocols.findFirst({
    where: and(eq(protocols.protocolId, protocolId), eq(protocols.chain, chain)),
  });
}

async function getTroveManagersForProtocol(protocolId: number, chain: string) {
  const protocol = await getProtocol(protocolId, chain);
  if (!protocol) return [];

  return await db.query.troveManagers.findMany({
    where: eq(troveManagers.protocolPk, protocol.pk),
  });
}

export async function getLatestCoreImmutables(protocolId: number, chain: string): Promise<CoreImmutables | null> {
  const protocol = await getProtocol(protocolId, chain);
  if (!protocol) return null;

  const latestCoreImmutable = await db.query.coreImmutables.findFirst({
    where: eq(coreImmutables.protocolPk, protocol.pk),
    orderBy: [desc(coreImmutables.blockNumber)],
  });

  if (!latestCoreImmutable) return null;

  const troveMgrs = await getTroveManagersForProtocol(protocolId, chain);
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

export async function getLatestTroveDataEntries(protocolId: number, chain: string) {
  const protocol = await getProtocol(protocolId, chain);
  if (!protocol) return null;

  const troveMgrs = await getTroveManagersForProtocol(protocolId, chain);
  if (!troveMgrs.length) return null;

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
      ).rows as unknown as TroveDataRow[];
      console.log(entries);
      if (!entries.length) return null;

      // Get the highest block number
      const maxBlock = Math.max(...entries.map((e) => e.blockNumber));

      // Transform entries directly, removing internal fields
      const troveDataEntries = entries.map(
        ({ blockNumber, pk, troveManagerPk, rn, ...troveDataWithoutInternals }) => troveDataWithoutInternals
      );

      return {
        getTroveManagerIndex: tm.troveManagerIndex,
        blockNumber: maxBlock,
        chain,
        troveData: troveDataEntries,
      };
    })
  );

  return troveDataByManager.filter((td): td is NonNullable<typeof td> => td !== null);
}
