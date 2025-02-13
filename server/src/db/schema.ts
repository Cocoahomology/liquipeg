import { pgTable as table } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as d from "drizzle-orm/pg-core";

export const protocols = table(
  "protocols",
  {
    id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    protocolId: d.integer().notNull(),
    chain: d.varchar({ length: 32 }).notNull(),
  },
  (protocols) => [d.unique("protocols_protocol_id_chain_unique").on(protocols.protocolId, protocols.chain)]
);

export const troveManagers = table(
  "trove_managers",
  {
    id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    protocolId: d
      .integer()
      .references(() => protocols.id, { onDelete: "cascade" })
      .notNull(),
    troveManagerIndex: d.integer().notNull(),
  },
  (troveManagers) => [
    d
      .unique("trove_managers_protocol_trove_manager_unique")
      .on(troveManagers.protocolId, troveManagers.troveManagerIndex),
  ]
);

export const troveData = table(
  "trove_data",
  {
    id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    troveId: d.bigint({ mode: "bigint" }).notNull(),
    blockNumber: d.integer().notNull(),
    troveManagerId: d
      .integer()
      .references(() => troveManagers.id, { onDelete: "cascade" })
      .notNull(),
    debt: d.bigint({ mode: "bigint" }).notNull(),
    collateral: d.bigint({ mode: "bigint" }).notNull(),
    stake: d.bigint({ mode: "bigint" }).notNull(),
    /* Status: 0=nonExistent, 1=active, 2=closedByOwner, 3=closedByLiquidation, 4=zombie */
    status: d.integer().notNull(),
    arrayIndex: d.integer().notNull(),
    lastDebtUpdateTime: d.bigint({ mode: "bigint" }).notNull(),
    lastInterestRateAdjTime: d.bigint({ mode: "bigint" }).notNull(),
    annualInterestRate: d.bigint({ mode: "bigint" }).notNull(),
    interestBatchManager: d.varchar({ length: 42 }).notNull(),
    batchDebtShares: d.bigint({ mode: "bigint" }).notNull(),
  },
  (troveData) => [
    d.index("trove_data_trove_manager_block_idx").on(troveData.troveManagerId, troveData.blockNumber),
    d.uniqueIndex("trove_data_trove_id_block_unique_idx").on(troveData.troveId, troveData.blockNumber),
    d.check("trove_data_status_check", sql`${troveData.status} >=0 AND ${troveData.status} < 5`),
  ]
);

export const eventData = table(
  "event_data",
  {
    id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    troveManagerId: d
      .integer()
      .references(() => troveManagers.id, { onDelete: "cascade" })
      .notNull(),
    blockNumber: d.integer().notNull(),
    txHash: d.varchar({ length: 66 }).notNull(),
    logIndex: d.integer().notNull(),
    eventName: d.varchar({ length: 128 }).notNull(),
    eventData: d.json().notNull(),
  },
  (eventData) => [
    d.index("event_data_block_number_event_name_idx").on(eventData.blockNumber, eventData.eventName),
    d.unique("event_data_row_unique").on(eventData.txHash, eventData.eventName, eventData.logIndex),
  ]
);

export const coreImmutables = table(
  "core_immutables",
  {
    id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    protocolId: d
      .integer()
      .references(() => protocols.id, { onDelete: "cascade" })
      .notNull(),
    blockNumber: d.integer().notNull(),
    boldToken: d.varchar({ length: 42 }).notNull(),
    collateralRegistry: d.varchar({ length: 42 }).notNull(),
    interestRouter: d.varchar({ length: 42 }).notNull(),
  },
  (coreImmutables) => [
    d
      .uniqueIndex("core_immutables_block_number_protocol_id_unique_idx")
      .on(coreImmutables.blockNumber, coreImmutables.protocolId),
  ]
);

export const coreColImmutables = table(
  "core_col_immutables",
  {
    id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    troveManagerId: d
      .integer()
      .references(() => troveManagers.id, { onDelete: "cascade" })
      .notNull(),
    blockNumber: d.integer().notNull(),
    CCR: d.bigint({ mode: "bigint" }).notNull(),
    SCR: d.bigint({ mode: "bigint" }).notNull(),
    MCR: d.bigint({ mode: "bigint" }).notNull(),
    troveManager: d.varchar({ length: 42 }).notNull(),
    collToken: d.varchar({ length: 42 }).notNull(),
    activePool: d.varchar({ length: 42 }).notNull(),
    defaultPool: d.varchar({ length: 42 }).notNull(),
    stabilityPool: d.varchar({ length: 42 }).notNull(),
    borrowerOperationsAddress: d.varchar({ length: 42 }).notNull(),
    sortedTroves: d.varchar({ length: 42 }).notNull(),
    troveNFT: d.varchar({ length: 42 }).notNull(),
    priceFeed: d.varchar({ length: 42 }).notNull(),
  },
  (coreColImmutables) => [
    d
      .uniqueIndex("core_col_immutables_block_number_trove_manager_id_unique_idx")
      .on(coreColImmutables.blockNumber, coreColImmutables.troveManagerId),
  ]
);

export const corePoolData = table(
  "core_pool_data",
  {
    id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    protocolId: d
      .integer()
      .references(() => protocols.id, { onDelete: "cascade" })
      .notNull(),
    blockNumber: d.integer().notNull(),
    baseRate: d.bigint({ mode: "bigint" }).notNull(),
    getRedemptionRate: d.bigint({ mode: "bigint" }).notNull(),
    totalCollaterals: d.bigint({ mode: "bigint" }).notNull(),
  },
  (corePoolData) => [
    d
      .uniqueIndex("core_pool_data_block_number_protocol_id_unique_idx")
      .on(corePoolData.blockNumber, corePoolData.protocolId),
  ]
);

export const colPoolData = table(
  "col_pool_data",
  {
    id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    troveManagerId: d
      .integer()
      .references(() => troveManagers.id, { onDelete: "cascade" })
      .notNull(),
    blockNumber: d.integer().notNull(),
    getEntireSystemColl: d.bigint({ mode: "bigint" }).notNull(),
    getEntireSystemDebt: d.bigint({ mode: "bigint" }).notNull(),
    getTroveIdsCount: d.bigint({ mode: "bigint" }).notNull(),
    aggWeightedRecordedDebtSum: d.bigint({ mode: "bigint" }).notNull(),
    aggRecordedDebt: d.bigint({ mode: "bigint" }).notNull(),
    calcPendingAggInterest: d.bigint({ mode: "bigint" }).notNull(),
    calcPendingSPYield: d.bigint({ mode: "bigint" }).notNull(),
    lastAggUpdateTime: d.bigint({ mode: "bigint" }).notNull(),
    getCollBalance: d.bigint({ mode: "bigint" }).notNull(),
    getTotalBoldDeposits: d.bigint({ mode: "bigint" }).notNull(),
    getYieldGainsOwed: d.bigint({ mode: "bigint" }).notNull(),
    getYieldGainsPending: d.bigint({ mode: "bigint" }).notNull(),
  },
  (colPoolData) => [
    d
      .uniqueIndex("col_pool_data_block_number_trove_manager_id_unique_idx")
      .on(colPoolData.blockNumber, colPoolData.troveManagerId),
  ]
);

export const errorLogs = table("error_logs", {
  id: d.integer().primaryKey().generatedAlwaysAsIdentity(),
  name: d.text(),
  level: d.integer().notNull(),
  hostName: d.text(),
  // Keyword: 'timeout', 'missingValues', 'critical', 'missingBlocks'
  keyword: d.varchar({ length: 32 }),
  table: d.varchar({ length: 64 }),
  chain: d.varchar({ length: 32 }),
  msg: d.text(),
  pid: d.integer(),
  time: d.timestamp({ withTimezone: true }).defaultNow(),
});
