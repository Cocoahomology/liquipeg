import db from "./db";
import { getTable } from "./schema";
import { Adapter } from "../utils/adapter.type";
import { ErrorLoggerService } from "../utils/bunyan";
import { TroveDataEntry, CorePoolDataEntry, CoreImmutablesEntry } from "../utils/types";
import { eq, and } from "drizzle-orm";
import { DEFAULT_INSERT_OPTIONS, InsertOptions } from "./types";
const retry = require("async-retry");

export async function insertEntriesFromAdapter(adapterFn: keyof Adapter, data: object[], options: InsertOptions = {}) {
  const mergedOptions = { ...DEFAULT_INSERT_OPTIONS, ...options };
  switch (adapterFn) {
    case "fetchTroves":
      await insertEntries(data as TroveDataEntry[], mergedOptions, insertTroveData, "troveData");
      break;
    case "fetchCorePoolData":
      await insertEntries(data as CorePoolDataEntry[], mergedOptions, insertCorePoolData, "corePoolData");
      break;
    case "fetchImmutables":
      await insertEntries(data as CoreImmutablesEntry[], mergedOptions, insertCoreImmutables, "coreImmutables");
      break;
  }
}

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

async function getTroveManagerPk(trx: any, protocolPk: number, troveManagerIndex: number): Promise<number> {
  const troveManagersTable = getTable("troveManagers");

  const troveManager = await db
    .select()
    .from(troveManagersTable)
    .where(
      and(eq(troveManagersTable.protocolPk, protocolPk), eq(troveManagersTable.troveManagerIndex, troveManagerIndex))
    );

  if (troveManager.length) {
    return troveManager[0].pk;
  }

  const [result] = await trx
    .insert(troveManagersTable)
    .values({
      protocolPk,
      troveManagerIndex,
    })
    .returning({ pk: troveManagersTable.pk });

  return result.pk;
}

async function insertEntries(
  data: any[],
  options: InsertOptions,
  insertFn: (
    trx: any,
    data: any,
    protocolPk: number,
    blockNumber: number,
    onConflict: "error" | "ignore"
  ) => Promise<void>,
  tableName: string
) {
  const {
    allowNullDbValues = DEFAULT_INSERT_OPTIONS.allowNullDbValues ?? false,
    retryCount = DEFAULT_INSERT_OPTIONS.retryCount ?? 3,
    retryDelay = DEFAULT_INSERT_OPTIONS.retryDelay ?? 2000,
    onConflict = DEFAULT_INSERT_OPTIONS.onConflict ?? "error",
  } = options;

  const logger = ErrorLoggerService.getInstance();
  if (!data.length) {
    return;
  }

  if (retryCount < 1) {
    throw new Error("retryCount must be at least 1");
  }

  const protocolsTable = getTable("protocols");

  // First, get or create all required protocols outside the transaction
  const protocolMap = new Map<string, number>();

  for (const entry of data) {
    const { protocolId, chain } = entry;
    const key = `${protocolId}-${chain}`;

    if (!protocolMap.has(key)) {
      const protocol = await db
        .select()
        .from(protocolsTable)
        .where(and(eq(protocolsTable.protocolId, protocolId), eq(protocolsTable.chain, chain)));

      if (protocol.length) {
        protocolMap.set(key, protocol[0].pk);
      } else {
        const [result] = await db
          .insert(protocolsTable)
          .values({
            protocolId: protocolId,
            chain: chain,
          })
          .returning({ pk: protocolsTable.pk });
        protocolMap.set(key, result.pk);
      }
    }
  }

  await db.transaction(async (trx) => {
    await Promise.all(
      data.map(async (entry) => {
        const { protocolId, blockNumber, chain } = entry;
        const protocolPk = protocolMap.get(`${protocolId}-${chain}`);

        validateRows([entry], allowNullDbValues);
        await retry(
          async () => {
            await insertFn(trx, entry, protocolPk!, blockNumber, onConflict);
          },
          {
            retries: retryCount,
            minTimeout: retryDelay,
          }
        ).catch((error: Error) => {
          logger.error({
            error: error.message,
            keyword: "critical",
            table: tableName,
            chain,
          });
          throw error;
        });
      })
    );
  });
}

async function insertTroveData(
  trx: any,
  troveDataEntry: TroveDataEntry,
  protocolPk: number,
  blockNumber: number,
  onConflict: "error" | "ignore"
) {
  const troveDataTable = getTable("troveData");
  console.log("fuck4");

  const { getTroveManagerIndex, troveData } = troveDataEntry;

  const troveManagerPk = await getTroveManagerPk(trx, protocolPk, getTroveManagerIndex);

  if (onConflict === "ignore") {
    await trx
      .insert(troveDataTable)
      .values(troveData.map((row) => ({ ...row, troveManagerPk, blockNumber })))
      .onConflictDoNothing();
  } else {
    await trx.insert(troveDataTable).values(troveData.map((row) => ({ ...row, troveManagerPk, blockNumber })));
  }
}

async function insertCoreImmutables(
  trx: any,
  immutablesData: CoreImmutablesEntry,
  protocolPk: number,
  blockNumber: number,
  onConflict: "error" | "ignore"
) {
  const coreImmutablesTable = getTable("coreImmutables");
  const coreColImmutablesTable = getTable("coreColImmutables");

  const { boldToken, collateralRegistry, interestRouter, coreCollateralImmutables } = immutablesData;

  const coreImmutablesEntry = {
    protocolPk: protocolPk,
    blockNumber: blockNumber,
    boldToken: boldToken,
    collateralRegistry: collateralRegistry,
    interestRouter: interestRouter,
  };

  await trx.insert(coreImmutablesTable).values(coreImmutablesEntry);

  await Promise.all(
    coreCollateralImmutables.map(async (coreColImmutables) => {
      const { getTroveManagerIndex } = coreColImmutables;

      const troveManagerPk = await getTroveManagerPk(trx, protocolPk, getTroveManagerIndex);

      const colPoolDataEntry = {
        troveManagerPk,
        blockNumber,
        ...coreColImmutables,
      };
      if (onConflict === "ignore") {
        await trx.insert(coreColImmutablesTable).values(colPoolDataEntry).onConflictDoNothing();
      } else {
        await trx.insert(coreColImmutablesTable).values(colPoolDataEntry);
      }
    })
  );
}

async function insertCorePoolData(
  trx: any,
  poolData: CorePoolDataEntry,
  protocolPk: number,
  blockNumber: number,
  onConflict: "error" | "ignore"
) {
  const corePoolDataTable = getTable("corePoolData");
  const colPoolDataTable = getTable("colPoolData");

  const { baseRate, getRedemptionRate, totalCollaterals, collateralPoolData } = poolData;

  const corePoolDataEntry = {
    protocolPk: protocolPk,
    blockNumber: blockNumber,
    baseRate: baseRate,
    getRedemptionRate: getRedemptionRate,
    totalCollaterals: totalCollaterals,
  };

  await trx.insert(corePoolDataTable).values(corePoolDataEntry);

  await Promise.all(
    collateralPoolData.map(async (colPoolData) => {
      const { getTroveManagerIndex } = colPoolData;

      const troveManagerPk = await getTroveManagerPk(trx, protocolPk, getTroveManagerIndex);

      const colPoolDataEntry = {
        troveManagerPk,
        blockNumber,
        ...colPoolData,
      };
      if (onConflict === "ignore") {
        await trx.insert(colPoolDataTable).values(colPoolDataEntry).onConflictDoNothing();
      } else {
        await trx.insert(colPoolDataTable).values(colPoolDataEntry);
      }
    })
  );
}
