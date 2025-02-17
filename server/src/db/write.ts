import db from "./db";
import { getTable } from "./schema";
import { Adapter } from "../utils/adapter.type";
import { ErrorLoggerService } from "../utils/bunyan";
import { TroveDataEntry, CorePoolDataEntry, CoreImmutablesEntry } from "../utils/types";
import { eq, and } from "drizzle-orm";

function validateRows(rows: any[], allowNullDbValues: boolean) {
  const logger = ErrorLoggerService.getInstance();
  if (!allowNullDbValues) {
    for (const row of rows) {
      for (const key in row) {
        if (row[key] == null || row[key] === "") {
          const error = new Error(`Null value found in row for key: ${key}`);
          logger.error({
            error: error.message,
            keyword: "missingValues",
          });
          throw error;
        }
      }
    }
  }
}

export async function insertAdapterEntries(
  // FIX data type
  adapterFn: keyof Adapter,
  data: object[],
  allowNullDbValues: boolean = false,
  onConflict: "ignore" | "error" = "error",
  retryCount: number = 3,
  retryDelay: number = 1000
) {
  const logger = ErrorLoggerService.getInstance();
  if (!data.length) {
    return;
  }

  if (retryCount < 1) {
    throw new Error("retryCount must be at least 1");
  }

  switch (adapterFn) {
    case "fetchTroves":
      await insertTroveDataEntries(data as TroveDataEntry[], allowNullDbValues, onConflict, retryCount, retryDelay);
      break;
    case "fetchCorePoolData":
      await insertCorePoolDataEntries(
        data as CorePoolDataEntry[],
        allowNullDbValues,
        onConflict,
        retryCount,
        retryDelay
      );
      break;
    case "fetchImmutables":
      await insertCoreImmutablesEntries(
        data as CoreImmutablesEntry[],
        allowNullDbValues,
        onConflict,
        retryCount,
        retryDelay
      );
      break;
  }
}

async function insertTroveDataEntries(
  data: TroveDataEntry[],
  allowNullDbValues: boolean = false,
  _onConflict: "ignore" | "error" = "error",
  _retryCount: number = 3,
  _retryDelay: number = 1000
) {
  //FIX: retry, logging
  const logger = ErrorLoggerService.getInstance();

  const protocolsTable = getTable("protocols");
  const troveManagersTable = getTable("troveManagers");
  const troveDataTable = getTable("troveData");

  await db.transaction(async (trx) => {
    await Promise.all(
      data.map(async (troveDataEntry) => {
        const { protocolId, blockNumber, getTroveManagerIndex, chain, troveData } = troveDataEntry;

        const protocol = await db
          .select()
          .from(protocolsTable)
          .where(and(eq(protocolsTable.protocolId, protocolId), eq(protocolsTable.chain, chain)));
        let protocolPk = protocol[0]?.pk;
        console.log("protocolPk", protocolPk);
        if (!protocol.length) {
          console.log("inserting protocol");
          [protocolPk] = await trx
            .insert(protocolsTable)
            .values({
              protocolId: protocolId,
              chain: chain,
            })
            .returning({ pk: protocolsTable.pk });
        }

        const troveManager = await db
          .select()
          .from(troveManagersTable)
          .where(
            and(
              eq(troveManagersTable.protocolPk, protocolPk),
              eq(troveManagersTable.troveManagerIndex, getTroveManagerIndex)
            )
          );
        let troveManagerPk = troveManager[0]?.pk;
        if (!troveManager.length) {
          [troveManagerPk] = await trx
            .insert(troveManagersTable)
            .values({
              protocolPk: protocolPk,
              troveManagerIndex: getTroveManagerIndex,
            })
            .returning({ pk: troveManagersTable.pk });
        }

        validateRows(troveData, allowNullDbValues);
        await trx.insert(troveDataTable).values(troveData.map((row) => ({ ...row, troveManagerPk, blockNumber })));
      })
    );
  });
}

async function insertCoreImmutablesEntries(
  data: CoreImmutablesEntry[],
  allowNullDbValues: boolean = false,
  _onConflict: "ignore" | "error" = "error",
  _retryCount: number = 3,
  _retryDelay: number = 1000
) {
  //FIX: retry, logging
  const logger = ErrorLoggerService.getInstance();

  const protocolsTable = getTable("protocols");
  const troveManagersTable = getTable("troveManagers");
  const coreImmutablesTable = getTable("coreImmutables");
  const coreColImmutablesTable = getTable("coreColImmutables");

  await db.transaction(async (trx) => {
    await Promise.all(
      data.map(async (immutablesData) => {
        const {
          protocolId,
          blockNumber,
          chain,
          boldToken,
          collateralRegistry,
          interestRouter,
          coreCollateralImmutables,
        } = immutablesData;

        const protocol = await db
          .select()
          .from(protocolsTable)
          .where(and(eq(protocolsTable.protocolId, protocolId), eq(protocolsTable.chain, chain)));
        let protocolPk = protocol[0]?.pk;
        console.log("protocolPk", protocolPk);
        if (!protocol.length) {
          console.log("inserting protocol");
          [protocolPk] = await trx
            .insert(protocolsTable)
            .values({
              protocolId: protocolId,
              chain: chain,
            })
            .returning({ pk: protocolsTable.pk });
        }

        const coreImmutablesEntry = {
          protocolPk: protocolPk,
          blockNumber: blockNumber,
          boldToken: boldToken,
          collateralRegistry: collateralRegistry,
          interestRouter: interestRouter,
        };

        validateRows([coreImmutablesEntry], allowNullDbValues);
        await trx.insert(coreImmutablesTable).values(coreImmutablesEntry);

        await Promise.all(
          coreCollateralImmutables.map(async (coreColImmutables) => {
            const { getTroveManagerIndex } = coreColImmutables;
            const troveManager = await db
              .select()
              .from(troveManagersTable)
              .where(
                and(
                  eq(troveManagersTable.protocolPk, protocolPk),
                  eq(troveManagersTable.troveManagerIndex, getTroveManagerIndex)
                )
              );
            let troveManagerPk = troveManager[0]?.pk;
            if (!troveManager.length) {
              [troveManagerPk] = await trx
                .insert(troveManagersTable)
                .values({
                  protocolPk: protocolPk,
                  troveManagerIndex: getTroveManagerIndex,
                })
                .returning({ pk: troveManagersTable.pk });
            }

            const colPoolDataEntry = {
              troveManagerPk,
              blockNumber,
              ...coreColImmutables,
            };
            validateRows([colPoolDataEntry], allowNullDbValues);
            await trx.insert(coreColImmutablesTable).values(colPoolDataEntry);
          })
        );
      })
    );
  });
}

async function insertCorePoolDataEntries(
  data: CorePoolDataEntry[],
  allowNullDbValues: boolean = false,
  _onConflict: "ignore" | "error" = "error",
  _retryCount: number = 3,
  _retryDelay: number = 1000
) {
  //FIX: retry, logging
  const logger = ErrorLoggerService.getInstance();

  const protocolsTable = getTable("protocols");
  const troveManagersTable = getTable("troveManagers");
  const corePoolDataTable = getTable("corePoolData");
  const colPoolDataTable = getTable("colPoolData");

  await db.transaction(async (trx) => {
    await Promise.all(
      data.map(async (poolData) => {
        const { protocolId, blockNumber, chain, baseRate, getRedemptionRate, totalCollaterals, collateralPoolData } =
          poolData;

        const protocol = await db
          .select()
          .from(protocolsTable)
          .where(and(eq(protocolsTable.protocolId, protocolId), eq(protocolsTable.chain, chain)));
        let protocolPk = protocol[0]?.pk;
        console.log("protocolPk", protocolPk);
        if (!protocol.length) {
          console.log("inserting protocol");
          [protocolPk] = await trx
            .insert(protocolsTable)
            .values({
              protocolId: protocolId,
              chain: chain,
            })
            .returning({ pk: protocolsTable.pk });
        }

        const corePoolDataEntry = {
          protocolPk: protocolPk,
          blockNumber: blockNumber,
          baseRate: baseRate,
          getRedemptionRate: getRedemptionRate,
          totalCollaterals: totalCollaterals,
        };

        validateRows([corePoolDataEntry], allowNullDbValues);
        await trx.insert(corePoolDataTable).values(corePoolDataEntry);

        await Promise.all(
          collateralPoolData.map(async (colPoolData) => {
            const { getTroveManagerIndex } = colPoolData;
            const troveManager = await db
              .select()
              .from(troveManagersTable)
              .where(
                and(
                  eq(troveManagersTable.protocolPk, protocolPk),
                  eq(troveManagersTable.troveManagerIndex, getTroveManagerIndex)
                )
              );
            let troveManagerPk = troveManager[0]?.pk;
            if (!troveManager.length) {
              [troveManagerPk] = await trx
                .insert(troveManagersTable)
                .values({
                  protocolPk: protocolPk,
                  troveManagerIndex: getTroveManagerIndex,
                })
                .returning({ pk: troveManagersTable.pk });
            }

            const colPoolDataEntry = {
              troveManagerPk,
              blockNumber,
              ...colPoolData,
            };
            validateRows([colPoolDataEntry], allowNullDbValues);
            await trx.insert(colPoolDataTable).values(colPoolDataEntry);
          })
        );
      })
    );
  });
}
