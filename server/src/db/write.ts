import db from "./db";
import { getTable, recordedBlocks } from "./schema";
import { Adapter } from "../utils/adapter.type";
import { ErrorLoggerService } from "../utils/bunyan";
import {
  TroveDataEntry,
  CorePoolDataEntry,
  CoreImmutablesEntry,
  EventDataEntry,
  RecordedBlocksEntryWithChain,
  CollateralPricesAndRatesEntry,
} from "../utils/types";
import { protocols, troveManagers } from "./schema";
import { eq, and, sql } from "drizzle-orm";
import { PgTransaction } from "drizzle-orm/pg-core";
import { DEFAULT_INSERT_OPTIONS, InsertOptions } from "./types";
import retry from "async-retry";
import { importProtocol } from "../data/importProtocol";
import { PromisePool } from "@supercharge/promise-pool";

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

  const { boldToken, collateralRegistry, interestRouter, coreCollateralImmutables, chain } = immutablesData;

  const coreImmutablesEntry = {
    protocolPk: protocolPk,
    blockNumber: blockNumber,
    boldToken: boldToken,
    collateralRegistry: collateralRegistry,
    interestRouter: interestRouter,
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

  const { troveManagerIndex, protocolId, chain, blockNumber, ...remainingEventData } = eventData;

  try {
    const troveManagerPk = await getTroveManagerPk(trx, protocolPk, troveManagerIndex);

    const eventDataEntry = {
      troveManagerPk: troveManagerPk,
      troveManagerIndex: troveManagerIndex,
      blockNumber,
      ...remainingEventData,
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
    hour: number | null;
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
