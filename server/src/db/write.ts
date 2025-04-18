import db from "./db";
import * as sdk from "@defillama/sdk";
import {
  getTable,
  recordedBlocks,
  coreColImmutables,
  pricesAndRates,
  troveData,
  corePoolData,
  colPoolData,
  blockTimestamps,
  troveManagerTimeSamplePoints,
} from "./schema";
import { Adapter } from "../utils/adapter.type";
import { ErrorLoggerService } from "../utils/bunyan";
import {
  TroveDataEntry,
  CorePoolDataEntry,
  CoreImmutablesEntry,
  EventDataEntry,
  RecordedBlocksEntryWithChain,
  CollateralPricesAndRatesEntry,
  HourlyTroveDataSummaryEntry,
  TroveOwnerEntry,
} from "../utils/types";
import { protocols, troveManagers } from "./schema";
import { eq, lt, gt, gte, lte, and, sql, Param } from "drizzle-orm";
import { PgTransaction } from "drizzle-orm/pg-core";
import { DEFAULT_INSERT_OPTIONS, InsertOptions } from "./types";
import { withTimeout } from "../utils/async";
import retry from "async-retry";
import { importProtocol } from "../data/importProtocol";
import { PromisePool } from "@supercharge/promise-pool";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfHour } from "../utils/date";

// FIX: types throughout this file

export async function insertEntriesFromAdapter(
  adapterFn: keyof Adapter,
  data: object[],
  options: InsertOptions = {},
  trx?: PgTransaction<any, any, any>
) {
  if (data.length === 0) return;
  const mergedOptions = { ...DEFAULT_INSERT_OPTIONS, ...options };
  switch (adapterFn) {
    case "fetchTroves":
      await insertEntries(data as TroveDataEntry[], mergedOptions, insertTroveData, "troveData", trx);
      break;
    case "fetchCorePoolData":
      await insertEntries(data as CorePoolDataEntry[], mergedOptions, insertCorePoolData, "corePoolData", trx);
      break;
    case "fetchImmutables":
      await insertEntries(data as CoreImmutablesEntry[], mergedOptions, insertCoreImmutables, "coreImmutables", trx);
      break;
    case "fetchTroveOperations":
      await insertEntries(data as EventDataEntry[], mergedOptions, insertEventData, "eventData", trx);
      break;
  }
}

function validateRows(rows: any[], allowNullDbValues: boolean) {
  // Define keys that are allowed to be null
  const allowedNullKeys = ["operation", "nativeToken"];

  const logger = ErrorLoggerService.getInstance();
  if (!allowNullDbValues) {
    for (const row of rows) {
      for (const key in row) {
        if ((row[key] == null || row[key] === "") && !allowedNullKeys.includes(key)) {
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

export async function insertEntries(
  data: any[],
  options: InsertOptions,
  insertFn: (
    trx: any,
    data: any,
    protocolPk: number,
    onConflict: "update" | "ignore",
    blockNumber?: number
  ) => Promise<void>,
  tableName: string,
  trx?: PgTransaction<any, any, any>
) {
  const {
    allowNullDbValues = DEFAULT_INSERT_OPTIONS.allowNullDbValues ?? false,
    retryCount = DEFAULT_INSERT_OPTIONS.retryCount ?? 2,
    retryDelay = DEFAULT_INSERT_OPTIONS.retryDelay ?? 2000,
    onConflict = DEFAULT_INSERT_OPTIONS.onConflict ?? "update",
  } = options;

  const logger = ErrorLoggerService.getInstance();
  if (!data.length) {
    return;
  }

  const protocolsTable = getTable("protocols");
  const protocolMap = new Map<string, number>();

  for (const entry of data) {
    const { protocolId, chain } = entry;
    const key = `${protocolId}-${chain}`;

    const protocol = importProtocol(undefined, protocolId);
    const protocolDbName = protocol?.protocolDbName;

    if (!protocolDbName) {
      throw new Error(
        `protocolData does not contain name for protocol with ID ${protocolId}, ensure it has been added.`
      );
    }

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
            name: protocolDbName,
          })
          .returning({ pk: protocolsTable.pk });
        protocolMap.set(key, result.pk);
      }
    }
  }

  let hasLoggedError = false;
  const logFirstError = (error: Error, chain?: string) => {
    if (!hasLoggedError) {
      logger.error({
        error: error.message,
        keyword: "critical",
        table: tableName,
        chain,
      });
      hasLoggedError = true;
    }
  };

  const executeInserts = async (transaction: any) => {
    await PromisePool.for(data)
      .withConcurrency(20)
      .withTaskTimeout(30000)
      .process(async (entry) => {
        const { protocolId, blockNumber, chain } = entry;
        try {
          const protocolPk = protocolMap.get(`${protocolId}-${chain}`);

          validateRows([entry], allowNullDbValues);

          await retry(
            async () => {
              await insertFn(transaction, entry, protocolPk!, onConflict, blockNumber);
            },
            {
              retries: retryCount,
              minTimeout: retryDelay,
              onRetry: (error) => {
                logFirstError(error as Error, chain);
              },
            }
          );
        } catch (error) {
          if (error instanceof Error) {
            logFirstError(error, chain);
            throw error;
          } else throw error;
        }
      });
  };

  if (trx) {
    await executeInserts(trx);
  } else {
    await db.transaction(async (newTrx) => {
      await executeInserts(newTrx);
    });
  }
}

async function findClosestGtBlockEntry(table: any, targetBlock: number, filterCondition: any) {
  const logger = ErrorLoggerService.getInstance();
  try {
    const [result] = await db
      .select({
        blockNumber: table.blockNumber,
      })
      .from(table)
      .where(and(filterCondition, gt(table.blockNumber, targetBlock)))
      .orderBy(sql`ABS(${table.blockNumber} - ${targetBlock})`)
      .limit(1);

    return result?.blockNumber as number | undefined;
  } catch (error) {
    logger.error({
      error: `Failed to find closest block entry (greater than): ${error}`,
      keyword: "missingValues",
      function: "findClosestGtBlockEntry",
    });
    throw error;
  }
}

async function findClosestLtBlockEntry(table: any, targetBlock: number, filterCondition: any) {
  const logger = ErrorLoggerService.getInstance();
  try {
    const [result] = await db
      .select({
        blockNumber: table.blockNumber,
      })
      .from(table)
      .where(and(filterCondition, lt(table.blockNumber, targetBlock)))
      .orderBy(sql`ABS(${table.blockNumber} - ${targetBlock})`)
      .limit(1);

    return result?.blockNumber as number | undefined;
  } catch (error) {
    logger.error({
      error: `Failed to find closest block entry (less than): ${error}`,
      keyword: "missingValues",
      function: "findClosestLtBlockEntry",
    });
    throw error;
  }
}

async function insertTroveData(
  trx: any,
  troveDataEntry: TroveDataEntry,
  protocolPk: number,
  onConflict: "update" | "ignore",
  blockNumber?: number
) {
  const troveDataTable = getTable("troveData");
  const logger = ErrorLoggerService.getInstance();
  let hasLoggedError = false;

  const logFirstError = (error: Error, chain?: string) => {
    if (!hasLoggedError) {
      logger.error({
        error: error.message,
        keyword: "critical",
        table: "troveData",
        chain,
      });
      hasLoggedError = true;
    }
  };

  const { troveManagerIndex, troveData, chain } = troveDataEntry;

  try {
    const troveManagerPk = await getTroveManagerPk(trx, protocolPk, troveManagerIndex);

    if (onConflict === "ignore") {
      await trx
        .insert(troveDataTable)
        .values(troveData.map((row) => ({ ...row, troveManagerPk, blockNumber })))
        .onConflictDoNothing();
    } else {
      await trx.insert(troveDataTable).values(troveData.map((row) => ({ ...row, troveManagerPk, blockNumber })));
    }
  } catch (error) {
    if (error instanceof Error) {
      logFirstError(error, chain);
      throw error;
    }
    throw error;
  }
}

async function insertCoreImmutables(
  trx: any,
  immutablesData: CoreImmutablesEntry,
  protocolPk: number,
  onConflict: "update" | "ignore",
  blockNumber?: number
) {
  const coreImmutablesTable = getTable("coreImmutables");
  const coreColImmutablesTable = getTable("coreColImmutables");
  const logger = ErrorLoggerService.getInstance();
  let hasLoggedError = false;

  const logFirstError = (error: Error, chain?: string) => {
    if (!hasLoggedError) {
      logger.error({
        error: error.message,
        keyword: "critical",
        table: "coreImmutables",
        chain,
      });
      hasLoggedError = true;
    }
  };

  const { coreCollateralImmutables, chain } = immutablesData;

  const coreImmutablesEntry = {
    ...immutablesData,
    protocolPk: protocolPk,
    blockNumber: blockNumber,
  };

  try {
    // Insert core immutables with conflict handling for the unique constraint on protocolPk
    if (onConflict === "ignore") {
      await trx
        .insert(coreImmutablesTable)
        .values(coreImmutablesEntry)
        .onConflictDoNothing({
          target: [coreImmutablesTable.protocolPk],
        });
    } else {
      // Update if there's a conflict - this will keep the latest data
      await trx
        .insert(coreImmutablesTable)
        .values(coreImmutablesEntry)
        .onConflictDoUpdate({
          target: [coreImmutablesTable.protocolPk],
          set: coreImmutablesEntry,
        });
    }

    await PromisePool.for(coreCollateralImmutables).process(async (coreColImmutables) => {
      try {
        const { troveManagerIndex } = coreColImmutables;

        const troveManagerPk = await getTroveManagerPk(trx, protocolPk, troveManagerIndex);

        const colPoolDataEntry = {
          troveManagerPk,
          blockNumber,
          ...coreColImmutables,
        };

        // Insert col immutables with conflict handling for the unique constraint on troveManagerPk
        if (onConflict === "ignore") {
          await trx
            .insert(coreColImmutablesTable)
            .values(colPoolDataEntry)
            .onConflictDoNothing({
              target: [coreColImmutablesTable.troveManagerPk],
            });
        } else {
          // Update if there's a conflict - this will keep the latest data
          await trx
            .insert(coreColImmutablesTable)
            .values(colPoolDataEntry)
            .onConflictDoUpdate({
              target: [coreColImmutablesTable.troveManagerPk],
              set: colPoolDataEntry,
            });
        }
      } catch (error) {
        if (error instanceof Error) {
          logFirstError(error, chain);
          throw error;
        }
        throw error;
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      logFirstError(error, chain);
      throw error;
    }
    throw error;
  }
}

async function insertCorePoolData(
  trx: any,
  poolData: CorePoolDataEntry,
  protocolPk: number,
  onConflict: "update" | "ignore",
  blockNumber?: number
) {
  const corePoolDataTable = getTable("corePoolData");
  const colPoolDataTable = getTable("colPoolData");
  const logger = ErrorLoggerService.getInstance();
  let hasLoggedError = false;

  const logFirstError = (error: Error, chain?: string) => {
    if (!hasLoggedError) {
      logger.error({
        error: error.message,
        keyword: "critical",
        table: "corePoolData",
        chain,
      });
      hasLoggedError = true;
    }
  };

  const { baseRate, getRedemptionRate, totalCollaterals, collateralPoolData, chain } = poolData;

  try {
    const corePoolDataEntry = {
      protocolPk: protocolPk,
      blockNumber: blockNumber,
      baseRate: baseRate,
      getRedemptionRate: getRedemptionRate,
      totalCollaterals: totalCollaterals,
    };

    await trx.insert(corePoolDataTable).values(corePoolDataEntry);

    await PromisePool.for(collateralPoolData).process(async (colPoolData) => {
      try {
        const { troveManagerIndex } = colPoolData;
        const troveManagerPk = await getTroveManagerPk(trx, protocolPk, troveManagerIndex);

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
      } catch (error) {
        if (error instanceof Error) {
          logFirstError(error, chain);
          throw error;
        }
        throw error;
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      logFirstError(error, chain);
      throw error;
    }
    throw error;
  }
}

async function insertEventData(
  trx: any,
  eventData: EventDataEntry,
  protocolPk: number,
  onConflict: "update" | "ignore"
) {
  const eventDataTable = getTable("eventData");
  const blockTimestampsTable = getTable("blockTimestamps");
  const logger = ErrorLoggerService.getInstance();
  let hasLoggedError = false;

  const logFirstError = (error: Error, chain?: string) => {
    if (!hasLoggedError) {
      logger.error({
        error: error.message,
        keyword: "critical",
        table: "eventData",
        chain,
      });
      hasLoggedError = true;
    }
  };

  const { troveManagerIndex, protocolId, chain, blockNumber, eventName, ...remainingEventData } = eventData;

  try {
    const troveManagerPk = await getTroveManagerPk(trx, protocolPk, troveManagerIndex);
    let operation = undefined;
    if (eventName === "TroveOperation" && remainingEventData.eventData) {
      operation = (remainingEventData.eventData as { operation?: string }).operation;
    }

    const eventDataEntry = {
      troveManagerPk: troveManagerPk,
      troveManagerIndex: troveManagerIndex,
      blockNumber,
      eventName,
      ...remainingEventData,
      operation,
    };

    if (onConflict === "ignore") {
      await trx.insert(eventDataTable).values(eventDataEntry).onConflictDoNothing();
    } else {
      await trx.insert(eventDataTable).values(eventDataEntry);
    }

    if (blockNumber) {
      await trx
        .insert(blockTimestampsTable)
        .values({
          chain,
          blockNumber,
          timestamp: null,
          timestampMissing: true,
        })
        .onConflictDoNothing();
    }
  } catch (error) {
    if (error instanceof Error) {
      logFirstError(error, chain);
      throw error;
    }
    throw error;
  }
}

export async function insertTroveOwners(
  trx: any,
  troveOwnerEntry: TroveOwnerEntry,
  protocolPk: number,
  onConflict: "update" | "ignore",
  blockNumber?: number
) {
  const troveOwnersTable = getTable("troveOwners");
  const logger = ErrorLoggerService.getInstance();
  let hasLoggedError = false;

  const logFirstError = (error: Error, chain?: string) => {
    if (!hasLoggedError) {
      logger.error({
        error: error.message,
        keyword: "critical",
        table: "troveOwners",
        chain,
      });
      hasLoggedError = true;
    }
  };

  const { troveManagerIndex, troveOwners: owners, chain } = troveOwnerEntry;

  try {
    const troveManagerPk = await getTroveManagerPk(trx, protocolPk, troveManagerIndex);

    if (onConflict === "ignore") {
      await trx
        .insert(troveOwnersTable)
        .values(
          owners.map((owner) => ({
            troveId: owner.troveId,
            troveManagerPk,
            ownerAddress: owner.ownerAddress,
            blockNumber,
          }))
        )
        .onConflictDoNothing({
          target: [troveOwnersTable.troveManagerPk, troveOwnersTable.troveId, troveOwnersTable.blockNumber],
        });
    } else {
      await trx
        .insert(troveOwnersTable)
        .values(
          owners.map((owner) => ({
            troveId: owner.troveId,
            troveManagerPk,
            ownerAddress: owner.ownerAddress,
            blockNumber,
          }))
        )
        .onConflictDoUpdate({
          target: [troveOwnersTable.troveManagerPk, troveOwnersTable.troveId, troveOwnersTable.blockNumber],
          set: {
            ownerAddress: sql`excluded.owner_address`,
          },
        });
    }
  } catch (error) {
    if (error instanceof Error) {
      logFirstError(error, chain);
      throw error;
    }
    throw error;
  }
}

export async function insertRecordedBlockEntries(
  recordedBlocksList: RecordedBlocksEntryWithChain[],
  options: InsertOptions = {},
  trx?: PgTransaction<any, any, any>
) {
  const {
    retryCount = DEFAULT_INSERT_OPTIONS.retryCount ?? 2,
    retryDelay = DEFAULT_INSERT_OPTIONS.retryDelay ?? 2000,
  } = options;

  if (!recordedBlocksList.length) return;

  const logger = ErrorLoggerService.getInstance();
  const protocolsTable = getTable("protocols");
  const protocolMap = new Map<string, number>();

  for (const entry of recordedBlocksList) {
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
        throw new Error(`Protocol not found: ${protocolId} on chain ${chain}`);
      }
    }
  }

  let hasLoggedError = false;
  const logFirstError = (error: Error, chain?: string) => {
    if (!hasLoggedError) {
      logger.error({
        error: error.message,
        keyword: "missingBlocks",
        table: "recordedBlocks",
        chain,
      });
      hasLoggedError = true;
    }
  };

  const executeInserts = async (transaction: any) => {
    await PromisePool.for(recordedBlocksList)
      .withConcurrency(20)
      .withTaskTimeout(30000)
      .process(async (entry) => {
        const { protocolId, chain, startBlock, endBlock } = entry;
        try {
          const protocolPk = protocolMap.get(`${protocolId}-${chain}`);
          await retry(
            async () => {
              await transaction
                .insert(recordedBlocks)
                .values({
                  protocolPk: protocolPk!,
                  startBlock,
                  endBlock,
                })
                .onConflictDoUpdate({
                  target: recordedBlocks.protocolPk,
                  set: {
                    startBlock: sql`LEAST(${startBlock}, recorded_blocks.start_block)`,
                    endBlock: sql`GREATEST(${endBlock}, recorded_blocks.end_block)`,
                  },
                });
            },
            {
              retries: retryCount,
              minTimeout: retryDelay,
              onRetry: (error) => {
                logFirstError(error as Error, chain);
              },
            }
          );
        } catch (error) {
          if (error instanceof Error) {
            logFirstError(error, chain);
            throw error;
          } else throw error;
        }
      });
  };

  if (trx) {
    await executeInserts(trx);
  } else {
    await db.transaction(async (newTrx) => {
      await executeInserts(newTrx);
    });
  }
}

export async function insertBlockTimestampEntries(
  chain: string,
  blockTimestamps: { blockNumber: number; timestamp?: number }[],
  options: InsertOptions = {},
  trx?: PgTransaction<any, any, any>
) {
  if (!blockTimestamps.length) return;

  const uniqueBlockTimestamps = Array.from(
    blockTimestamps
      .reduce((map, entry) => {
        const existing = map.get(entry.blockNumber);
        if (!existing || (!existing.timestamp && entry.timestamp)) {
          map.set(entry.blockNumber, entry);
        }
        return map;
      }, new Map<number, { blockNumber: number; timestamp?: number }>())
      .values()
  );

  const {
    retryCount = DEFAULT_INSERT_OPTIONS.retryCount ?? 2,
    retryDelay = DEFAULT_INSERT_OPTIONS.retryDelay ?? 2000,
  } = options;

  const logger = ErrorLoggerService.getInstance();
  const blockTimestampsTable = getTable("blockTimestamps");

  let hasLoggedError = false;
  const logFirstError = (error: Error, chain?: string) => {
    if (!hasLoggedError) {
      logger.error({
        error: error.message,
        keyword: "missingBlocks",
        table: "blockTimestamps",
        chain,
      });
      hasLoggedError = true;
    }
  };

  const executeInserts = async (transaction: any) => {
    await PromisePool.for(uniqueBlockTimestamps)
      .withConcurrency(20)
      .withTaskTimeout(30000)
      .process(async (entry) => {
        try {
          await retry(
            async () => {
              if (!entry.timestamp) {
                await transaction
                  .insert(blockTimestampsTable)
                  .values({
                    chain,
                    blockNumber: entry.blockNumber,
                    timestamp: null,
                    timestampMissing: true,
                  })
                  .onConflictDoNothing();
              } else {
                await transaction
                  .insert(blockTimestampsTable)
                  .values({
                    chain,
                    blockNumber: entry.blockNumber,
                    timestamp: entry.timestamp,
                    timestampMissing: false,
                  })
                  .onConflictDoUpdate({
                    target: [blockTimestampsTable.chain, blockTimestampsTable.blockNumber],
                    set: {
                      timestamp: entry.timestamp,
                      timestampMissing: false,
                    },
                  });
              }
            },
            {
              retries: retryCount,
              minTimeout: retryDelay,
              onRetry: (error) => {
                logFirstError(error as Error, chain);
              },
            }
          );
        } catch (error) {
          if (error instanceof Error) {
            logFirstError(error, chain);
            throw error;
          } else throw error;
        }
      });
  };

  if (trx) {
    await executeInserts(trx);
  } else {
    await db.transaction(async (newTrx) => {
      await executeInserts(newTrx);
    });
  }
}

export async function insertPricesAndRatesEntries(
  pricesAndRatesList: CollateralPricesAndRatesEntry[],
  options: InsertOptions = {},
  trx?: PgTransaction<any, any, any>
) {
  const {
    retryCount = DEFAULT_INSERT_OPTIONS.retryCount ?? 2,
    retryDelay = DEFAULT_INSERT_OPTIONS.retryDelay ?? 2000,
  } = options;

  if (!pricesAndRatesList.length) return;

  const logger = ErrorLoggerService.getInstance();
  const protocolsTable = getTable("protocols");
  const protocolMap = new Map<string, number>();

  for (const entry of pricesAndRatesList) {
    const { protocolId, chain } = entry;
    if (!protocolId) continue;

    const key = `${protocolId}-${chain}`;

    if (!protocolMap.has(key)) {
      const protocol = await db
        .select()
        .from(protocolsTable)
        .where(and(eq(protocolsTable.protocolId, protocolId), eq(protocolsTable.chain, chain)));

      if (protocol.length) {
        protocolMap.set(key, protocol[0].pk);
      } else {
        throw new Error(`Protocol not found: ${protocolId} on chain ${chain}`);
      }
    }
  }

  let hasLoggedError = false;
  const logFirstError = (error: Error, chain?: string) => {
    if (!hasLoggedError) {
      logger.error({
        error: error.message,
        keyword: "critical",
        table: "pricesAndRates",
        chain,
      });
      hasLoggedError = true;
    }
  };

  const executeInserts = async (transaction: any) => {
    const pricesAndRatesTable = getTable("pricesAndRates");
    await PromisePool.for(pricesAndRatesList)
      .withConcurrency(20)
      .withTaskTimeout(30000)
      .process(async (entry) => {
        const {
          protocolId,
          chain,
          blockNumber,
          troveManagerIndex,
          colUSDPriceFeed,
          colUSDOracle,
          LSTUnderlyingCanonicalRate,
          LSTUnderlyingMarketRate,
          underlyingUSDOracle,
          deviation,
          redemptionRelatedOracles,
        } = entry;
        if (!protocolId) return;

        try {
          const protocolPk = protocolMap.get(`${protocolId}-${chain}`);
          const troveManagerPk = await getTroveManagerPk(transaction, protocolPk!, troveManagerIndex);

          await retry(
            async () => {
              await transaction
                .insert(pricesAndRatesTable)
                .values({
                  troveManagerPk,
                  blockNumber,
                  colUSDPriceFeed,
                  colUSDOracle,
                  LSTUnderlyingCanonicalRate,
                  LSTUnderlyingMarketRate,
                  underlyingUSDOracle,
                  deviation,
                  redemptionRelatedOracles,
                })
                .onConflictDoUpdate({
                  target: [pricesAndRatesTable.blockNumber, pricesAndRatesTable.troveManagerPk],
                  set: {
                    colUSDPriceFeed,
                    colUSDOracle,
                    LSTUnderlyingCanonicalRate,
                    LSTUnderlyingMarketRate,
                    underlyingUSDOracle,
                    deviation,
                    redemptionRelatedOracles,
                  },
                });
            },
            {
              retries: retryCount,
              minTimeout: retryDelay,
              onRetry: (error) => {
                logFirstError(error as Error, chain);
              },
            }
          );
        } catch (error) {
          if (error instanceof Error) {
            logFirstError(error, chain);
            throw error;
          } else throw error;
        }
      });
  };

  if (trx) {
    await executeInserts(trx);
  } else {
    await db.transaction(async (newTrx) => {
      await executeInserts(newTrx);
    });
  }
}

export async function insertSamplePointEntries(
  samplePoints: {
    date: Date;
    hour: number;
    targetTimestamp: number;
    troveManagerPk?: number;
    protocolPk?: number;
    corePoolDataBlockNumber?: number;
    colPoolDataBlockNumber?: number;
    pricesAndRatesBlockNumber?: number;
  }[],
  options: InsertOptions = {},
  trx?: PgTransaction<any, any, any>
) {
  if (!samplePoints.length) return;

  const {
    retryCount = DEFAULT_INSERT_OPTIONS.retryCount ?? 2,
    retryDelay = DEFAULT_INSERT_OPTIONS.retryDelay ?? 2000,
  } = options;

  const logger = ErrorLoggerService.getInstance();
  const troveManagerTimeSamplePointsTable = getTable("troveManagerTimeSamplePoints");
  const protocolTimeSamplePointsTable = getTable("protocolTimeSamplePoints");

  // Create a map to store chains by troveManagerPk and protocolPk
  const chainMap = new Map<string, string>();

  // Validate that each entry has either troveManagerPk or protocolPk, but not both
  for (const entry of samplePoints) {
    if (!entry.troveManagerPk && !entry.protocolPk) {
      throw new Error("Sample point must have either troveManagerPk or protocolPk");
    }
  }

  // Get chains for all troveManagerPks
  const troveManagerPks = samplePoints.filter((entry) => entry.troveManagerPk).map((entry) => entry.troveManagerPk!);

  if (troveManagerPks.length) {
    const troveManagerChains = await db
      .select({
        pk: troveManagers.pk,
        chain: protocols.chain,
      })
      .from(troveManagers)
      .innerJoin(protocols, eq(troveManagers.protocolPk, protocols.pk))
      .where(sql`${troveManagers.pk} IN ${troveManagerPks}`);

    for (const { pk, chain } of troveManagerChains) {
      chainMap.set(`tm_${pk}`, chain);
    }
  }

  // Get chains for all protocolPks
  const protocolPks = samplePoints.filter((entry) => entry.protocolPk).map((entry) => entry.protocolPk!);

  if (protocolPks.length) {
    const protocolChains = await db
      .select({
        pk: protocols.pk,
        chain: protocols.chain,
      })
      .from(protocols)
      .where(sql`${protocols.pk} IN ${protocolPks}`);

    for (const { pk, chain } of protocolChains) {
      chainMap.set(`p_${pk}`, chain);
    }
  }

  let hasLoggedError = false;
  const logFirstError = (error: Error, chain?: string) => {
    if (!hasLoggedError) {
      logger.error({
        error: error.message,
        keyword: "critical",
        table: "timeSamplePoints",
        chain,
      });
      hasLoggedError = true;
    }
  };

  const executeInserts = async (transaction: any) => {
    // Group sample points by type (trove manager or protocol)
    const troveManagerSamplePoints = samplePoints.filter((entry) => entry.troveManagerPk);
    const protocolSamplePoints = samplePoints.filter((entry) => entry.protocolPk);

    // Insert trove manager sample points
    if (troveManagerSamplePoints.length > 0) {
      await PromisePool.for(troveManagerSamplePoints)
        .withConcurrency(20)
        .withTaskTimeout(30000)
        .process(async (entry) => {
          try {
            // Get the chain for this entry
            const chain = chainMap.get(`tm_${entry.troveManagerPk}`);

            if (!chain) {
              throw new Error(`Could not find chain for trove manager entry: ${JSON.stringify(entry)}`);
            }

            await retry(
              async () => {
                await transaction
                  .insert(troveManagerTimeSamplePointsTable)
                  .values({
                    chain,
                    date: entry.date,
                    hour: entry.hour,
                    targetTimestamp: entry.targetTimestamp,
                    troveManagerPk: entry.troveManagerPk,
                    colPoolDataBlockNumber: entry.colPoolDataBlockNumber,
                    pricesAndRatesBlockNumber: entry.pricesAndRatesBlockNumber,
                  })
                  .onConflictDoUpdate({
                    target: [
                      troveManagerTimeSamplePointsTable.date,
                      troveManagerTimeSamplePointsTable.hour,
                      troveManagerTimeSamplePointsTable.troveManagerPk,
                    ],
                    set: {
                      targetTimestamp: entry.targetTimestamp,
                      colPoolDataBlockNumber: entry.colPoolDataBlockNumber,
                      pricesAndRatesBlockNumber: entry.pricesAndRatesBlockNumber,
                    },
                  });
              },
              {
                retries: retryCount,
                minTimeout: retryDelay,
                onRetry: (error) => {
                  logFirstError(error as Error, chain);
                },
              }
            );
          } catch (error) {
            if (error instanceof Error) {
              logFirstError(error, chainMap.get(`tm_${entry.troveManagerPk}`));
              throw error;
            } else throw error;
          }
        });
    }

    // Insert protocol sample points
    if (protocolSamplePoints.length > 0) {
      await PromisePool.for(protocolSamplePoints)
        .withConcurrency(20)
        .withTaskTimeout(30000)
        .process(async (entry) => {
          try {
            // Get the chain for this entry
            const chain = chainMap.get(`p_${entry.protocolPk}`);

            if (!chain) {
              throw new Error(`Could not find chain for protocol entry: ${JSON.stringify(entry)}`);
            }

            await retry(
              async () => {
                await transaction
                  .insert(protocolTimeSamplePointsTable)
                  .values({
                    chain,
                    date: entry.date,
                    hour: entry.hour,
                    targetTimestamp: entry.targetTimestamp,
                    protocolPk: entry.protocolPk,
                    corePoolDataBlockNumber: entry.corePoolDataBlockNumber,
                  })
                  .onConflictDoUpdate({
                    target: [
                      protocolTimeSamplePointsTable.date,
                      protocolTimeSamplePointsTable.hour,
                      protocolTimeSamplePointsTable.protocolPk,
                    ],
                    set: {
                      targetTimestamp: entry.targetTimestamp,
                      corePoolDataBlockNumber: entry.corePoolDataBlockNumber,
                    },
                  });
              },
              {
                retries: retryCount,
                minTimeout: retryDelay,
                onRetry: (error) => {
                  logFirstError(error as Error, chain);
                },
              }
            );
          } catch (error) {
            if (error instanceof Error) {
              logFirstError(error, chainMap.get(`p_${entry.protocolPk}`));
              throw error;
            } else throw error;
          }
        });
    }
  };

  if (trx) {
    await executeInserts(trx);
  } else {
    await db.transaction(async (newTrx) => {
      await executeInserts(newTrx);
    });
  }
}

export async function insertHourlyTroveDataSummaryEntries(
  summaryEntries: HourlyTroveDataSummaryEntry[],
  options: InsertOptions = {},
  trx?: PgTransaction<any, any, any>
) {
  if (!summaryEntries.length) return;

  const {
    retryCount = DEFAULT_INSERT_OPTIONS.retryCount ?? 2,
    retryDelay = DEFAULT_INSERT_OPTIONS.retryDelay ?? 2000,
    onConflict = DEFAULT_INSERT_OPTIONS.onConflict ?? "update",
  } = options;

  const logger = ErrorLoggerService.getInstance();
  const protocolsTable = getTable("protocols");
  const protocolMap = new Map<string, number>();

  for (const entry of summaryEntries) {
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
        throw new Error(`Protocol not found: ${protocolId} on chain ${chain}`);
      }
    }
  }

  let hasLoggedError = false;
  const logFirstError = (error: Error, chain?: string) => {
    if (!hasLoggedError) {
      logger.error({
        error: error.message,
        keyword: "critical",
        table: "hourlyTroveDataSummary",
        chain,
      });
      hasLoggedError = true;
    }
  };

  const executeInserts = async (transaction: any) => {
    const hourlyTroveDataSummaryTable = getTable("hourlyTroveDataSummary");
    await PromisePool.for(summaryEntries)
      .withConcurrency(20)
      .withTaskTimeout(30000)
      .process(async (entry) => {
        const {
          protocolId,
          chain,
          troveManagerIndex,
          date,
          hour,
          targetTimestamp,
          avgInterestRate,
          colRatio,
          statusCounts,
          totalTroves,
        } = entry;

        try {
          const protocolPk = protocolMap.get(`${protocolId}-${chain}`);
          const troveManagerPk = await getTroveManagerPk(transaction, protocolPk!, troveManagerIndex);

          await retry(
            async () => {
              if (onConflict === "ignore") {
                await transaction
                  .insert(hourlyTroveDataSummaryTable)
                  .values({
                    troveManagerPk,
                    date: new Date(date),
                    hour,
                    targetTimestamp,
                    avgInterestRate,
                    colRatio,
                    statusCounts,
                    totalTroves,
                  })
                  .onConflictDoNothing({
                    target: [
                      hourlyTroveDataSummaryTable.date,
                      hourlyTroveDataSummaryTable.hour,
                      hourlyTroveDataSummaryTable.troveManagerPk,
                    ],
                  });
              } else {
                await transaction
                  .insert(hourlyTroveDataSummaryTable)
                  .values({
                    troveManagerPk,
                    date: new Date(date),
                    hour,
                    targetTimestamp,
                    avgInterestRate,
                    colRatio,
                    statusCounts,
                    totalTroves,
                  })
                  .onConflictDoUpdate({
                    target: [
                      hourlyTroveDataSummaryTable.date,
                      hourlyTroveDataSummaryTable.hour,
                      hourlyTroveDataSummaryTable.troveManagerPk,
                    ],
                    set: {
                      targetTimestamp,
                      avgInterestRate,
                      colRatio,
                      statusCounts,
                      totalTroves,
                    },
                  });
              }
            },
            {
              retries: retryCount,
              minTimeout: retryDelay,
              onRetry: (error) => {
                logFirstError(error as Error, chain);
              },
            }
          );
        } catch (error) {
          if (error instanceof Error) {
            logFirstError(error, chain);
            throw error;
          } else throw error;
        }
      });
  };

  if (trx) {
    await executeInserts(trx);
  } else {
    await db.transaction(async (newTrx) => {
      await executeInserts(newTrx);
    });
  }
}

export async function fillHourlyTroveDataSummary(
  protocolId: number,
  chain: string,
  troveManagerIndex: number,
  targetTimestamp: number,
  hourly: boolean = false
) {
  const logger = ErrorLoggerService.getInstance();
  try {
    // Determine timestamp and hour based on whether we want daily or hourly sample points
    const startTimestamp = !hourly
      ? getTimestampAtStartOfDayUTC(targetTimestamp)
      : getTimestampAtStartOfHour(targetTimestamp);

    // For hourly samples, we need to calculate the hour (0-23)
    const hour = !hourly ? 0 : new Date(targetTimestamp * 1000).getUTCHours();
    const date = new Date(startTimestamp * 1000);

    // Get protocol and trove manager PKs
    const protocol = await db.query.protocols.findFirst({
      where: and(eq(protocols.protocolId, protocolId), eq(protocols.chain, chain)),
    });

    if (!protocol) {
      throw new Error(`Protocol not found: ${protocolId} on chain ${chain}`);
    }

    const troveMgr = await db.query.troveManagers.findFirst({
      where: and(eq(troveManagers.protocolPk, protocol.pk), eq(troveManagers.troveManagerIndex, troveManagerIndex)),
    });

    if (!troveMgr) {
      throw new Error(
        `Trove manager not found: index ${troveManagerIndex} for protocol ${protocolId} on chain ${chain}`
      );
    }

    // Find the troveManagerTimeSamplePoints entry with targetTimestamp closest to startTimestamp
    const samplePoints = await db.query.troveManagerTimeSamplePoints.findMany({
      where: and(
        eq(troveManagerTimeSamplePoints.troveManagerPk, troveMgr.pk),
        // Filter for dates within 1 day of the target date
        gte(troveManagerTimeSamplePoints.date, new Date(date.getTime() - 24 * 60 * 60 * 1000).toISOString()),
        lte(troveManagerTimeSamplePoints.date, new Date(date.getTime() + 24 * 60 * 60 * 1000).toISOString())
      ),
    });

    if (!samplePoints.length) {
      const errString = `No sample points found for trove manager ${troveManagerIndex} for protocol ${protocolId} on chain ${chain}`;
      console.log(errString);
      logger.error({
        error: errString,
        keyword: "missingValues",
        function: "fillHourlyTroveDataSummary",
        chain,
        protocolId,
      });
      return;
    }

    // Find the closest sample point to startTimestamp
    let closestSamplePoint = samplePoints[0];
    let minDiff = Math.abs(closestSamplePoint.targetTimestamp - startTimestamp);

    for (let i = 1; i < samplePoints.length; i++) {
      const diff = Math.abs(samplePoints[i].targetTimestamp - startTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestSamplePoint = samplePoints[i];
      }
    }

    // Check if the closest sample point is too far from startTimestamp
    const timeDiffInHours = minDiff / 3600; // Convert seconds to hours
    let colRatio = null;

    if (timeDiffInHours > 1) {
      const errString = `Closest sample point timestamp (${closestSamplePoint.targetTimestamp}) is more than 1 hour away from target timestamp (${startTimestamp})`;
      console.log(errString);
      logger.error({
        error: errString,
        keyword: "missingValues",
        function: "fillHourlyTroveDataSummary",
        chain,
        protocolId,
      });

      if (timeDiffInHours > 24) {
        const criticalErrString = `Closest sample point timestamp (${closestSamplePoint.targetTimestamp}) is more than 24 hours away from target timestamp (${startTimestamp})`;
        console.log(criticalErrString);
        logger.error({
          error: criticalErrString,
          keyword: "missingValues",
          function: "fillHourlyTroveDataSummary",
          chain,
          protocolId,
        });
        // We'll keep colRatio as null since the timestamp disparity is too large
      }
    }

    // Find all blocks within 24 hours of the target timestamp
    const blockTimestampRows = await db
      .select({
        blockNumber: blockTimestamps.blockNumber,
        timestamp: blockTimestamps.timestamp,
      })
      .from(blockTimestamps)
      .where(
        and(
          eq(blockTimestamps.chain, chain),
          gte(blockTimestamps.timestamp, startTimestamp - 24 * 3600),
          lt(blockTimestamps.timestamp, startTimestamp + 24 * 3600)
        )
      )
      .orderBy(blockTimestamps.timestamp);

    if (!blockTimestampRows.length) {
      const errString = `No blocks found in the timestamp range for fillHourlyTroveDataSummary for protocolId ${protocolId}, ts ${targetTimestamp}`;
      console.log(errString);
      logger.error({
        error: errString,
        keyword: "missingValues",
        function: "fillHourlyTroveDataSummary",
        chain,
        protocolId,
      });
      return;
    }

    // Get block numbers and create a lookup for timestamp by block
    const blockNumbers = blockTimestampRows.map((row) => row.blockNumber);
    const timestampByBlock: Record<number, number> = {};
    blockTimestampRows.forEach((row) => {
      if (row.timestamp !== null) {
        timestampByBlock[row.blockNumber] = row.timestamp;
      }
    });

    // Get all trove data entries for these blocks
    const troveEntries = await db
      .select()
      .from(troveData)
      .where(
        and(eq(troveData.troveManagerPk, troveMgr.pk), sql`${troveData.blockNumber} = ANY(${new Param(blockNumbers)})`)
      );

    if (!troveEntries.length) {
      const errString = `No trove data found for the blocks in the timestamp range for protocolId ${protocolId}, ts ${targetTimestamp}`;
      console.log(errString);
      logger.error({
        error: errString,
        keyword: "missingValues",
        function: "fillHourlyTroveDataSummary",
        chain,
        protocolId,
      });
      return;
    }

    // Group by trove ID and find the closest entry to the start timestamp for each trove
    const trovesByTroveId: Record<string, any[]> = {};
    troveEntries.forEach((entry: any) => {
      if (!trovesByTroveId[entry.troveId]) {
        trovesByTroveId[entry.troveId] = [];
      }
      trovesByTroveId[entry.troveId].push(entry);
    });

    // For each trove ID, find the closest entry to the start timestamp
    const closestEntries: any[] = [];
    Object.keys(trovesByTroveId).forEach((troveId) => {
      const entries = trovesByTroveId[troveId];
      let closestEntry = entries[0];
      let minDiff = Math.abs(timestampByBlock[closestEntry.blockNumber] - startTimestamp);

      for (let i = 1; i < entries.length; i++) {
        const entry = entries[i];
        const blockTimestamp = timestampByBlock[entry.blockNumber];
        const diff = Math.abs(blockTimestamp - startTimestamp);

        if (diff < minDiff) {
          minDiff = diff;
          closestEntry = entry;
        }
      }

      closestEntries.push(closestEntry);
    });

    // Get coreColImmutables to retrieve collTokenDecimals
    const colImmutables = await db.query.coreColImmutables.findFirst({
      where: eq(coreColImmutables.troveManagerPk, troveMgr.pk),
    });

    if (!colImmutables) {
      const errString = `Could not find coreColImmutables for trove manager ${troveManagerIndex} for protocol ${protocolId} on chain ${chain}`;
      console.log(errString);
      logger.error({
        error: errString,
        keyword: "missingValues",
        function: "fillHourlyTroveDataSummary",
        chain,
        protocolId,
      });
      return;
    }

    const collTokenDecimals = parseInt(colImmutables.collTokenDecimals);

    // Get pricesAndRates using the pricesAndRatesBlockNumber from the closest sample point
    let colUSDPriceFeed = null;
    if (closestSamplePoint.pricesAndRatesBlockNumber) {
      const priceRates = await db.query.pricesAndRates.findFirst({
        where: and(
          eq(pricesAndRates.troveManagerPk, troveMgr.pk),
          eq(pricesAndRates.blockNumber, closestSamplePoint.pricesAndRatesBlockNumber)
        ),
      });

      if (priceRates) {
        colUSDPriceFeed = priceRates.colUSDPriceFeed;
      } else {
        const errString = `Could not find pricesAndRates for block ${closestSamplePoint.pricesAndRatesBlockNumber}`;
        console.log(errString);
        logger.error({
          error: errString,
          keyword: "missingValues",
          function: "fillHourlyTroveDataSummary",
          chain,
          protocolId,
        });
      }
    }

    // Calculate summary statistics
    const statusCounts: Record<string, number> = {};
    let totalInterestRate = 0;
    let nonZeroInterestRateCount = 0;

    let totalColUsdValue = 0;
    let totalDebtAdjusted = 0;

    closestEntries.forEach((entry) => {
      const status = entry.status.toString();
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      if (status === "1") {
        const interestRate = parseFloat(entry.annualInterestRate) / 10 ** 16;
        if (interestRate > 0) {
          totalInterestRate += interestRate;
          nonZeroInterestRateCount++;
        }
      }

      // Calculate collateral ratio if possible
      if (colUSDPriceFeed && timeDiffInHours <= 24) {
        try {
          const coll = BigInt(entry.coll);
          const entireDebt = BigInt(entry.entireDebt);
          if (entireDebt > 0n) {
            const colUsdPriceFloat = parseFloat(colUSDPriceFeed);
            // Use a high precision multiplier (1e18) to preserve decimal places
            const PRICE_PRECISION = 10 ** 18;
            const colUsdPriceScaled = Math.round(colUsdPriceFloat * PRICE_PRECISION);

            // Calculate with scaled values
            const colUsdValue = (BigInt(colUsdPriceScaled) * coll) / BigInt(PRICE_PRECISION);
            const debtAdjusted = entireDebt * BigInt(10) ** BigInt(collTokenDecimals - 18);

            totalColUsdValue += Number(colUsdValue);
            totalDebtAdjusted += Number(debtAdjusted);
          }
        } catch (e) {
          console.error(`Error calculating col ratio for trove ${entry.troveId}:`, e);
        }
      } else {
        console.log("No colUSDPriceFeed found, skipping col ratio calculation.");
      }
    });

    const avgInterestRate =
      nonZeroInterestRateCount > 0 ? (totalInterestRate / nonZeroInterestRateCount).toFixed(3) : "0.000";

    // Calculate average collateral ratio based on sums
    if (totalDebtAdjusted > 0) {
      // Calculate the global collateral ratio from the sums
      colRatio = ((totalColUsdValue / totalDebtAdjusted) * 100).toFixed(3);
    }

    const summaryEntry: HourlyTroveDataSummaryEntry = {
      protocolId,
      chain,
      troveManagerIndex,
      date: date,
      hour,
      targetTimestamp: startTimestamp,
      avgInterestRate,
      colRatio,
      statusCounts,
      totalTroves: closestEntries.length,
    };
    // console.log(summaryEntry);

    await insertHourlyTroveDataSummaryEntries([summaryEntry], { onConflict: "update" });
  } catch (error) {
    const errString = `Failed to fill hourly trove data summary: ${error}`;
    console.error(errString);
    logger.error({
      error: errString,
      keyword: "missingValues",
      function: "fillHourlyTroveDataSummary",
      chain,
      protocolId,
    });
    throw error;
  }
}

// FIX: remove logging
export async function fillTimeSamplePoints(targetTimestamp: number, hourly: boolean = false) {
  const logger = ErrorLoggerService.getInstance();
  try {
    console.log(`========== STARTING FILL TIME SAMPLE POINTS ==========`);
    console.log(`Target timestamp: ${targetTimestamp} (${new Date(targetTimestamp * 1000).toISOString()})`);
    console.log(`Mode: ${hourly ? "Hourly" : "Daily"}`);

    const startTimestamp = !hourly
      ? getTimestampAtStartOfDayUTC(targetTimestamp)
      : getTimestampAtStartOfHour(targetTimestamp);
    console.log(`Adjusted start timestamp: ${startTimestamp} (${new Date(startTimestamp * 1000).toISOString()})`);

    const hour = !hourly ? 0 : new Date(targetTimestamp * 1000).getUTCHours();
    console.log(`Hour value: ${hour}`);

    console.log(`Fetching protocol entries from database...`);
    const protocolEntries = await db
      .select({
        pk: protocols.pk,
        chain: protocols.chain,
      })
      .from(protocols);
    console.log(`Found ${protocolEntries.length} protocol entries`);

    console.log(`Fetching trove manager entries from database...`);
    const troveManagerEntries = await db
      .select({
        pk: troveManagers.pk,
        chain: protocols.chain,
      })
      .from(troveManagers)
      .innerJoin(protocols, eq(troveManagers.protocolPk, protocols.pk));
    console.log(`Found ${troveManagerEntries.length} trove manager entries`);

    const samplePoints = [];

    console.log(`\n===== PROCESSING PROTOCOLS =====`);
    for (const [index, { pk: protocolPk, chain }] of protocolEntries.entries()) {
      console.log(`[${index + 1}/${protocolEntries.length}] Processing protocol pk=${protocolPk} on chain=${chain}`);
      try {
        console.log(`  Getting key block for timestamp ${startTimestamp} on chain ${chain}...`);
        const keyBlock = await retry(
          async () => withTimeout(sdk.blocks.getBlock(chain, startTimestamp), { milliseconds: 15000 }),
          {
            retries: 1,
            minTimeout: 1000,
            maxTimeout: 2000,
          }
        );
        const keyBlockNumber = keyBlock.number;
        console.log(`  Got key block number: ${keyBlockNumber}`);

        console.log(`  Finding closest GT core pool data block entry...`);
        let corePoolDataBlockNumber = await findClosestGtBlockEntry(
          corePoolData,
          keyBlockNumber,
          eq(corePoolData.protocolPk, protocolPk)
        );
        console.log(`  Closest GT core pool data block: ${corePoolDataBlockNumber || "none found"}`);

        const provider = await sdk.getProvider(chain);
        let corePoolDataBlockTimestamp;
        let corePoolDataBlock;
        let isValidBlock = false;

        const endTimestamp = !hourly ? startTimestamp + 24 * 60 * 60 : startTimestamp + 60 * 60;
        console.log(`  End timestamp cutoff: ${endTimestamp} (${new Date(endTimestamp * 1000).toISOString()})`);

        if (corePoolDataBlockNumber !== undefined) {
          console.log(`  Fetching block details for block ${corePoolDataBlockNumber}...`);
          corePoolDataBlock = await retry(
            async () => withTimeout(provider.getBlock(corePoolDataBlockNumber as number), { milliseconds: 15000 }),
            {
              retries: 1,
              minTimeout: 1000,
              maxTimeout: 2000,
            }
          );

          if (corePoolDataBlock) {
            corePoolDataBlockTimestamp = corePoolDataBlock.timestamp;
            isValidBlock = corePoolDataBlock.timestamp < endTimestamp;
            console.log(`  GT block timestamp: ${corePoolDataBlockTimestamp}, is valid: ${isValidBlock}`);
          } else {
            console.log(`  Failed to fetch GT block details`);
          }
        }

        if (!isValidBlock) {
          console.log(`  Finding closest LT core pool data block entry as fallback...`);
          corePoolDataBlockNumber = await findClosestLtBlockEntry(
            corePoolData,
            keyBlockNumber,
            eq(corePoolData.protocolPk, protocolPk)
          );
          console.log(`  Closest LT core pool data block: ${corePoolDataBlockNumber || "none found"}`);

          if (corePoolDataBlockNumber !== undefined) {
            console.log(`  Fetching block details for LT block ${corePoolDataBlockNumber}...`);
            corePoolDataBlock = await retry(
              async () => withTimeout(provider.getBlock(corePoolDataBlockNumber as number), { milliseconds: 15000 }),
              {
                retries: 1,
                minTimeout: 1000,
                maxTimeout: 2000,
              }
            );

            if (corePoolDataBlock) {
              corePoolDataBlockTimestamp = corePoolDataBlock.timestamp;
              const minTimestamp = !hourly ? startTimestamp - 24 * 60 * 60 : startTimestamp - 60 * 60;
              console.log(`  Min timestamp cutoff: ${minTimestamp} (${new Date(minTimestamp * 1000).toISOString()})`);
              isValidBlock = corePoolDataBlock.timestamp >= minTimestamp;
              console.log(`  LT block timestamp: ${corePoolDataBlockTimestamp}, is valid: ${isValidBlock}`);
            } else {
              console.log(`  Failed to fetch LT block details`);
            }
          }
        }

        if (isValidBlock && corePoolDataBlock) {
          console.log(`  Adding protocol sample point with core pool data block ${corePoolDataBlock.number}`);
          samplePoints.push({
            date: new Date(startTimestamp * 1000),
            hour: hour,
            targetTimestamp: startTimestamp,
            protocolPk,
            corePoolDataBlockNumber: corePoolDataBlock.number ?? undefined,
          });
        } else {
          console.log(`  No valid block found for protocol pk=${protocolPk}, skipping`);
        }
      } catch (error) {
        const errString = `Failed to process protocol pk ${protocolPk} on chain ${chain}: ${error}`;
        console.error(`  ERROR: ${errString}`);
        logger.error({
          error: errString,
          keyword: "missingValues",
          function: "fillTimeSamplePoints",
          chain,
        });
        continue;
      }
    }

    console.log(`\n===== PROCESSING TROVE MANAGERS =====`);
    for (const [index, { pk: troveManagerPk, chain }] of troveManagerEntries.entries()) {
      console.log(
        `[${index + 1}/${troveManagerEntries.length}] Processing trove manager pk=${troveManagerPk} on chain=${chain}`
      );
      try {
        console.log(`  Getting key block for timestamp ${startTimestamp} on chain ${chain}...`);
        const keyBlock = await retry(
          async () => withTimeout(sdk.blocks.getBlock(chain, startTimestamp), { milliseconds: 15000 }),
          {
            retries: 1,
            minTimeout: 1000,
            maxTimeout: 2000,
          }
        );

        const keyBlockNumber = keyBlock.number;
        console.log(`  Got key block number: ${keyBlockNumber}`);
        const provider = await sdk.getProvider(chain);

        const endTimestamp = !hourly ? startTimestamp + 24 * 60 * 60 : startTimestamp + 60 * 60;
        const minTimestamp = !hourly ? startTimestamp - 24 * 60 * 60 : startTimestamp - 60 * 60;
        console.log(
          `  Time window: ${new Date(minTimestamp * 1000).toISOString()} to ${new Date(
            endTimestamp * 1000
          ).toISOString()}`
        );

        console.log(`  Finding closest GT col pool data block entry...`);
        let colPoolDataBlockNumber = await findClosestGtBlockEntry(
          colPoolData,
          keyBlockNumber,
          eq(colPoolData.troveManagerPk, troveManagerPk)
        );
        console.log(`  Closest GT col pool data block: ${colPoolDataBlockNumber || "none found"}`);

        console.log(`  Finding closest GT prices and rates block entry...`);
        let pricesAndRatesBlockNumber = await findClosestGtBlockEntry(
          pricesAndRates,
          keyBlockNumber,
          eq(pricesAndRates.troveManagerPk, troveManagerPk)
        );
        console.log(`  Closest GT prices and rates block: ${pricesAndRatesBlockNumber || "none found"}`);

        let colPoolDataBlock, pricesAndRatesBlock;
        let colPoolDataBlockTimestamp, pricesAndRatesBlockTimestamp;
        let isValidColPoolBlock = false;
        let isValidPricesBlock = false;

        if (colPoolDataBlockNumber !== undefined) {
          console.log(`  Fetching block details for col pool block ${colPoolDataBlockNumber}...`);
          colPoolDataBlock = await retry(
            async () => withTimeout(provider.getBlock(colPoolDataBlockNumber as number), { milliseconds: 15000 }),
            {
              retries: 1,
              minTimeout: 1000,
              maxTimeout: 2000,
            }
          );

          if (colPoolDataBlock) {
            colPoolDataBlockTimestamp = colPoolDataBlock.timestamp;
            isValidColPoolBlock = colPoolDataBlock.timestamp < endTimestamp;
            console.log(
              `  GT col pool block timestamp: ${colPoolDataBlockTimestamp}, is valid: ${isValidColPoolBlock}`
            );
          } else {
            console.log(`  Failed to fetch GT col pool block details`);
          }
        }

        if (!isValidColPoolBlock) {
          console.log(`  Finding closest LT col pool data block entry as fallback...`);
          colPoolDataBlockNumber = await findClosestLtBlockEntry(
            colPoolData,
            keyBlockNumber,
            eq(colPoolData.troveManagerPk, troveManagerPk)
          );
          console.log(`  Closest LT col pool data block: ${colPoolDataBlockNumber || "none found"}`);

          if (colPoolDataBlockNumber !== undefined) {
            console.log(`  Fetching block details for LT col pool block ${colPoolDataBlockNumber}...`);
            colPoolDataBlock = await retry(
              async () => withTimeout(provider.getBlock(colPoolDataBlockNumber as number), { milliseconds: 15000 }),
              {
                retries: 1,
                minTimeout: 1000,
                maxTimeout: 2000,
              }
            );

            if (colPoolDataBlock) {
              colPoolDataBlockTimestamp = colPoolDataBlock.timestamp;
              isValidColPoolBlock = colPoolDataBlock.timestamp >= minTimestamp;
              console.log(
                `  LT col pool block timestamp: ${colPoolDataBlockTimestamp}, is valid: ${isValidColPoolBlock}`
              );
            } else {
              console.log(`  Failed to fetch LT col pool block details`);
            }
          }
        }

        if (pricesAndRatesBlockNumber !== undefined) {
          console.log(`  Fetching block details for prices and rates block ${pricesAndRatesBlockNumber}...`);
          pricesAndRatesBlock = await retry(
            async () => withTimeout(provider.getBlock(pricesAndRatesBlockNumber as number), { milliseconds: 15000 }),
            {
              retries: 1,
              minTimeout: 1000,
              maxTimeout: 2000,
            }
          );

          if (pricesAndRatesBlock) {
            pricesAndRatesBlockTimestamp = pricesAndRatesBlock.timestamp;
            isValidPricesBlock = pricesAndRatesBlock.timestamp < endTimestamp;
            console.log(
              `  GT prices block timestamp: ${pricesAndRatesBlockTimestamp}, is valid: ${isValidPricesBlock}`
            );
          } else {
            console.log(`  Failed to fetch GT prices block details`);
          }
        }

        if (!isValidPricesBlock) {
          console.log(`  Finding closest LT prices and rates block entry as fallback...`);
          pricesAndRatesBlockNumber = await findClosestLtBlockEntry(
            pricesAndRates,
            keyBlockNumber,
            eq(pricesAndRates.troveManagerPk, troveManagerPk)
          );
          console.log(`  Closest LT prices and rates block: ${pricesAndRatesBlockNumber || "none found"}`);

          if (pricesAndRatesBlockNumber !== undefined) {
            console.log(`  Fetching block details for LT prices block ${pricesAndRatesBlockNumber}...`);
            pricesAndRatesBlock = await retry(
              async () => withTimeout(provider.getBlock(pricesAndRatesBlockNumber as number), { milliseconds: 15000 }),
              {
                retries: 1,
                minTimeout: 1000,
                maxTimeout: 2000,
              }
            );

            if (pricesAndRatesBlock) {
              pricesAndRatesBlockTimestamp = pricesAndRatesBlock.timestamp;
              isValidPricesBlock = pricesAndRatesBlock.timestamp >= minTimestamp;
              console.log(
                `  LT prices block timestamp: ${pricesAndRatesBlockTimestamp}, is valid: ${isValidPricesBlock}`
              );
            } else {
              console.log(`  Failed to fetch LT prices block details`);
            }
          }
        }

        const validBlocks = {
          colPoolDataBlock: isValidColPoolBlock ? colPoolDataBlockNumber : null,
          pricesAndRatesBlock: isValidPricesBlock ? pricesAndRatesBlockNumber : null,
        };

        if (validBlocks.colPoolDataBlock || validBlocks.pricesAndRatesBlock) {
          console.log(`  Adding trove manager sample point with valid blocks: ${JSON.stringify(validBlocks)}`);
          samplePoints.push({
            date: new Date(startTimestamp * 1000),
            hour: hour,
            targetTimestamp: startTimestamp,
            troveManagerPk,
            colPoolDataBlockNumber: validBlocks.colPoolDataBlock ?? undefined,
            pricesAndRatesBlockNumber: validBlocks.pricesAndRatesBlock ?? undefined,
          });
        } else {
          console.log(`  No valid blocks found for trove manager pk=${troveManagerPk}, skipping`);
        }
      } catch (error) {
        const errString = `Failed to process trove manager ${troveManagerPk} on chain ${chain}: ${error}`;
        console.error(`  ERROR: ${errString}`);
        logger.error({
          error: errString,
          keyword: "missingValues",
          function: "fillTimeSamplePoints",
          chain,
        });
        continue;
      }
    }

    console.log(`\n===== SAMPLE POINTS SUMMARY =====`);
    console.log(`Total sample points collected: ${samplePoints.length}`);
    console.log(`Protocol sample points: ${samplePoints.filter((p) => p.protocolPk).length}`);
    console.log(`Trove manager sample points: ${samplePoints.filter((p) => p.troveManagerPk).length}`);

    if (samplePoints.length > 0) {
      console.log(`Inserting ${samplePoints.length} sample points into database...`);
      await insertSamplePointEntries(samplePoints, { onConflict: "update" });
      console.log(`Successfully inserted all sample points into database`);
    } else {
      console.log(`No sample points to insert, skipping database operation`);
    }

    console.log(`========== COMPLETED FILL TIME SAMPLE POINTS SUCCESSFULLY ==========`);
  } catch (error) {
    const errString = `Failed to fill time sample points: ${error}`;
    console.error(`========== FILL TIME SAMPLE POINTS FAILED ==========`);
    console.error(errString);
    logger.error({
      error: errString,
      keyword: "missingValues",
      function: "fillTimeSamplePoints",
    });
    throw error;
  }
}
