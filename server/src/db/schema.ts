import { pgTable as table, PgTableWithColumns } from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";
import * as d from "drizzle-orm/pg-core";

export const protocols = table(
  "protocols",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    protocolId: d.integer().notNull(),
    chain: d.varchar({ length: 32 }).notNull(),
    name: d.varchar({ length: 32 }),
  },
  (protocols) => [
    d.unique("protocols_protocol_id_chain_unique").on(protocols.protocolId, protocols.chain),
    d.unique("protocols_protocol_id_name_unique").on(protocols.protocolId, protocols.name),
  ]
);

export const troveManagers = table(
  "trove_managers",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    protocolPk: d
      .integer()
      .references(() => protocols.pk, { onDelete: "cascade" })
      .notNull(),
    troveManagerIndex: d.integer().notNull(),
  },
  (troveManagers) => [
    d
      .unique("trove_managers_protocol_trove_manager_unique")
      .on(troveManagers.protocolPk, troveManagers.troveManagerIndex),
  ]
);

export const troveData = table(
  "trove_data",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    troveId: d.varchar({ length: 96 }).notNull(),
    blockNumber: d.integer().notNull(),
    troveManagerPk: d
      .integer()
      .references(() => troveManagers.pk, { onDelete: "cascade" })
      .notNull(),
    debt: d.varchar({ length: 96 }).notNull(),
    entireDebt: d.varchar({ length: 96 }).notNull(),
    coll: d.varchar({ length: 96 }).notNull(),
    stake: d.varchar({ length: 96 }).notNull(),
    /* Status: 0=nonExistent, 1=active, 2=closedByOwner, 3=closedByLiquidation, 4=zombie */
    status: d.integer().notNull(),
    arrayIndex: d.integer().notNull(),
    lastDebtUpdateTime: d.varchar({ length: 96 }).notNull(),
    lastInterestRateAdjTime: d.varchar({ length: 96 }).notNull(),
    annualInterestRate: d.varchar({ length: 96 }).notNull(),
    accruedInterest: d.varchar({ length: 96 }).notNull(),
    interestBatchManager: d.varchar({ length: 42 }).notNull(),
    batchDebtShares: d.varchar({ length: 96 }).notNull(),
  },
  (troveData) => [
    d
      .index("trove_data_trove_manager_trove_id_block_idx")
      .on(troveData.troveManagerPk, troveData.troveId, troveData.blockNumber),
    d
      .uniqueIndex("trove_data_trove_manager_trove_id_block_unique_idx")
      .on(troveData.troveManagerPk, troveData.troveId, troveData.blockNumber),
    d.check("trove_data_status_check", sql`${troveData.status} >=0 AND ${troveData.status} < 5`),
  ]
);

export const troveOwners = table(
  "trove_owners",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    troveId: d.varchar({ length: 96 }).notNull(),
    troveManagerPk: d
      .integer()
      .references(() => troveManagers.pk, { onDelete: "cascade" })
      .notNull(),
    ownerAddress: d.varchar({ length: 42 }).notNull(),
    blockNumber: d.integer().notNull(),
  },
  (troveOwners) => [
    d
      .uniqueIndex("trove_owners_manager_id_block_number_unique_idx")
      .on(troveOwners.troveManagerPk, troveOwners.troveId, troveOwners.blockNumber),
    d.index("trove_owners_trove_id_idx").on(troveOwners.troveId),
    d.index("trove_owners_manager_id_idx").on(troveOwners.troveManagerPk),
  ]
);

export const eventData = table(
  "event_data",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    troveManagerPk: d
      .integer()
      .references(() => troveManagers.pk, { onDelete: "cascade" })
      .notNull(),
    blockNumber: d.integer().notNull(),
    txHash: d.varchar({ length: 66 }).notNull(),
    logIndex: d.integer().notNull(),
    eventName: d.varchar({ length: 128 }).notNull(),
    operation: d.integer(),
    eventData: d.jsonb().notNull(), // Fix: eventually normalize
  },
  (eventData) => [
    d.index("event_data_block_number_event_name_idx").on(eventData.blockNumber, eventData.eventName),
    d.unique("event_data_row_unique").on(eventData.txHash, eventData.eventName, eventData.logIndex),
    d.check(
      "event_data_operation_check",
      sql`${eventData.operation} IS NULL OR (${eventData.operation} >= 0 AND ${eventData.operation} <= 9)`
    ),
  ]
);

export const coreImmutables = table("core_immutables", {
  pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
  protocolPk: d
    .integer()
    .references(() => protocols.pk, { onDelete: "cascade" })
    .notNull()
    .unique(),
  blockNumber: d.integer().notNull(),
  boldToken: d.varchar({ length: 42 }).notNull(),
  boldTokenSymbol: d.varchar({ length: 16 }),
  nativeToken: d.varchar({ length: 42 }),
  collateralRegistry: d.varchar({ length: 42 }).notNull(),
  interestRouter: d.varchar({ length: 42 }).notNull(),
});

export const coreColImmutables = table("core_col_immutables", {
  pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
  troveManagerPk: d
    .integer()
    .references(() => troveManagers.pk, { onDelete: "cascade" })
    .notNull()
    .unique(),
  blockNumber: d.integer().notNull(),
  CCR: d.varchar({ length: 96 }).notNull(),
  SCR: d.varchar({ length: 96 }).notNull(),
  MCR: d.varchar({ length: 96 }).notNull(),
  troveManager: d.varchar({ length: 42 }).notNull(),
  collToken: d.varchar({ length: 42 }).notNull(),
  collTokenSymbol: d.varchar({ length: 16 }),
  collTokenDecimals: d.varchar({ length: 96 }).default("18").notNull(),
  activePool: d.varchar({ length: 42 }).notNull(),
  defaultPool: d.varchar({ length: 42 }).notNull(),
  stabilityPool: d.varchar({ length: 42 }).notNull(),
  borrowerOperationsAddress: d.varchar({ length: 42 }).notNull(),
  sortedTroves: d.varchar({ length: 42 }).notNull(),
  troveNFT: d.varchar({ length: 42 }).notNull(),
  priceFeed: d.varchar({ length: 42 }),
  isLST: d.boolean(),
  LSTunderlying: d.varchar({ length: 42 }),
  collAlternativeChainAddresses: d.text().array(),
});

export const corePoolData = table(
  "core_pool_data",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    protocolPk: d
      .integer()
      .references(() => protocols.pk, { onDelete: "cascade" })
      .notNull(),
    blockNumber: d.integer().notNull(),
    baseRate: d.varchar({ length: 96 }).notNull(),
    getRedemptionRate: d.varchar({ length: 96 }).notNull(),
    totalCollaterals: d.varchar({ length: 96 }).notNull(),
  },
  (corePoolData) => [
    d
      .uniqueIndex("core_pool_data_block_number_protocol_id_unique_idx")
      .on(corePoolData.blockNumber, corePoolData.protocolPk),
  ]
);

export const colPoolData = table(
  "col_pool_data",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    troveManagerPk: d
      .integer()
      .references(() => troveManagers.pk, { onDelete: "cascade" })
      .notNull(),
    blockNumber: d.integer().notNull(),
    getEntireSystemColl: d.varchar({ length: 96 }).notNull(),
    getEntireSystemDebt: d.varchar({ length: 96 }).notNull(),
    getTroveIdsCount: d.varchar({ length: 96 }).notNull(),
    aggWeightedRecordedDebtSum: d.varchar({ length: 96 }).notNull(),
    aggRecordedDebt: d.varchar({ length: 96 }).notNull(),
    calcPendingAggInterest: d.varchar({ length: 96 }).notNull(),
    calcPendingSPYield: d.varchar({ length: 96 }).notNull(),
    lastAggUpdateTime: d.varchar({ length: 96 }).notNull(),
    getCollBalanceActivePool: d.varchar({ length: 96 }).notNull(),
    getCollBalanceDefaultPool: d.varchar({ length: 96 }).notNull(),
    getCollBalanceStabilityPool: d.varchar({ length: 96 }).notNull(),
    // Sum of following 2 are total BOLD in SP
    getTotalBoldDeposits: d.varchar({ length: 96 }).notNull(),
    getYieldGainsOwed: d.varchar({ length: 96 }).notNull(),
    getYieldGainsPending: d.varchar({ length: 96 }).notNull(),
  },
  (colPoolData) => [
    d
      .uniqueIndex("col_pool_data_block_number_trove_manager_id_unique_idx")
      .on(colPoolData.blockNumber, colPoolData.troveManagerPk),
  ]
);

export const errorLogs = table("error_logs", {
  pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
  name: d.text(),
  level: d.integer().notNull(),
  hostname: d.text(),
  msg: d.text(),
  pid: d.integer(),
  time: d.timestamp({ withTimezone: true }).defaultNow(),
  content: d.jsonb(),
});

export const recordedBlocks = table(
  "recorded_blocks",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    protocolPk: d
      .integer()
      .references(() => protocols.pk, { onDelete: "cascade" })
      .notNull(),
    startBlock: d.integer().notNull(),
    endBlock: d.integer().notNull(),
  },
  (recordedBlocks) => [d.unique("recorded_blocks_protocol_pk_unique").on(recordedBlocks.protocolPk)]
);

export const pricesAndRates = table(
  "prices_and_rates",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    troveManagerPk: d
      .integer()
      .references(() => troveManagers.pk, { onDelete: "cascade" })
      .notNull(),
    blockNumber: d.integer().notNull(),
    colUSDPriceFeed: d.decimal({ precision: 36, scale: 18 }),
    colUSDOracle: d.decimal({ precision: 36, scale: 18 }),
    LSTUnderlyingCanonicalRate: d.decimal({ precision: 36, scale: 18 }),
    LSTUnderlyingMarketRate: d.decimal({ precision: 36, scale: 18 }),
    underlyingUSDOracle: d.decimal({ precision: 36, scale: 18 }),
    deviation: d.decimal({ precision: 19, scale: 18 }),
    redemptionRelatedOracles: d.jsonb(),
  },
  (pricesAndRates) => [
    d
      .uniqueIndex("prices_and_rates_block_number_trove_manager_unique_idx")
      .on(pricesAndRates.blockNumber, pricesAndRates.troveManagerPk),
  ]
);

// FIX: consider removing...used for eventData, pricesAndRates?
export const blockTimestamps = table(
  "block_timestamps",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    chain: d.varchar({ length: 32 }).notNull(),
    blockNumber: d.integer().notNull(),
    timestamp: d.integer(),
    timestampMissing: d.boolean().notNull().default(true),
  },
  (blockTimestamps) => [
    d
      .uniqueIndex("block_timestamps_chain_block_number_unique_idx")
      .on(blockTimestamps.chain, blockTimestamps.blockNumber),
    d.index("block_timestamps_missing_idx").on(blockTimestamps.timestampMissing),
    d.check(
      "block_timestamps_timestamp_missing_check",
      sql`NOT (${blockTimestamps.timestamp} IS NOT NULL AND ${blockTimestamps.timestampMissing} = true)`
    ),
  ]
);

export const troveManagerTimeSamplePoints = table(
  "trove_manager_time_sample_points",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    chain: d.varchar({ length: 32 }).notNull(),
    date: d.date().notNull(), // The date this sample represents
    hour: d.integer().notNull(), // 0 for daily points, 1-23 for hourly points
    troveManagerPk: d
      .integer()
      .references(() => troveManagers.pk, { onDelete: "cascade" })
      .notNull(),
    colPoolDataBlockNumber: d.integer(),
    pricesAndRatesBlockNumber: d.integer(),
    targetTimestamp: d.integer().notNull(), // The exact timestamp we're targeting
  },
  (troveManagerTimeSamplePoints) => [
    d
      .uniqueIndex("trove_manager_time_sample_points_date_hour_tm_unique_idx")
      .on(
        troveManagerTimeSamplePoints.date,
        troveManagerTimeSamplePoints.hour,
        troveManagerTimeSamplePoints.troveManagerPk
      ),
    d.check(
      "trove_manager_time_sample_points_hour_check",
      sql`${troveManagerTimeSamplePoints.hour} >= 0 AND ${troveManagerTimeSamplePoints.hour} <= 23`
    ),
  ]
);

export const protocolTimeSamplePoints = table(
  "protocol_time_sample_points",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    chain: d.varchar({ length: 32 }).notNull(),
    date: d.date().notNull(), // The date this sample represents
    hour: d.integer().notNull(), // 0 for daily points, 1-23 for hourly points
    protocolPk: d
      .integer()
      .references(() => protocols.pk, { onDelete: "cascade" })
      .notNull(),
    corePoolDataBlockNumber: d.integer(),
    targetTimestamp: d.integer().notNull(), // The exact timestamp we're targeting
  },
  (protocolTimeSamplePoints) => [
    d
      .uniqueIndex("protocol_time_sample_points_date_hour_protocol_unique_idx")
      .on(protocolTimeSamplePoints.date, protocolTimeSamplePoints.hour, protocolTimeSamplePoints.protocolPk),
    d.check(
      "protocol_time_sample_points_hour_check",
      sql`${protocolTimeSamplePoints.hour} >= 0 AND ${protocolTimeSamplePoints.hour} <= 23`
    ),
  ]
);

export const hourlyTroveDataSummary = table(
  "hourly_trove_data_summary",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    troveManagerPk: d
      .integer()
      .references(() => troveManagers.pk, { onDelete: "cascade" })
      .notNull(),
    date: d.date().notNull(),
    hour: d.integer().notNull(),
    targetTimestamp: d.integer().notNull(),
    avgInterestRate: d.decimal(),
    colRatio: d.decimal(),
    statusCounts: d.jsonb().notNull().default(JSON.stringify({})),
    totalTroves: d.integer().default(0).notNull(),
  },
  (hourlyTroveDataSummary) => [
    d
      .uniqueIndex("hourly_trove_data_summary_date_hour_tm_unique_idx")
      .on(hourlyTroveDataSummary.date, hourlyTroveDataSummary.hour, hourlyTroveDataSummary.troveManagerPk),
    d.check(
      "hourly_trove_data_summary_hour_check",
      sql`${hourlyTroveDataSummary.hour} >= 0 AND ${hourlyTroveDataSummary.hour} <= 23`
    ),
  ]
);

export const protocolsRelations = relations(protocols, ({ one, many }) => ({
  troveManagers: one(troveManagers, {
    fields: [protocols.pk],
    references: [troveManagers.protocolPk],
  }),
  coreImmutables: one(coreImmutables, {
    fields: [protocols.pk],
    references: [coreImmutables.protocolPk],
  }),
  corePoolData: one(corePoolData, {
    fields: [protocols.pk],
    references: [corePoolData.protocolPk],
  }),
  recordedBlocks: one(recordedBlocks, {
    fields: [protocols.pk],
    references: [recordedBlocks.protocolPk],
  }),
  pricesAndRates: many(pricesAndRates),
  protocolTimeSamplePoints: many(protocolTimeSamplePoints),
}));

export const troveManagerRelations = relations(troveManagers, ({ one, many }) => ({
  protocol: one(protocols, {
    fields: [troveManagers.protocolPk],
    references: [protocols.pk],
  }),
  troveData: many(troveData),
  eventData: many(eventData),
  coreColImmutables: one(coreColImmutables, {
    fields: [troveManagers.pk],
    references: [coreColImmutables.troveManagerPk],
  }),
  colPoolData: one(colPoolData, {
    fields: [troveManagers.pk],
    references: [colPoolData.troveManagerPk],
  }),
  pricesAndRates: many(pricesAndRates),
  troveManagerTimeSamplePoints: many(troveManagerTimeSamplePoints),
  hourlyTroveDataSummary: many(hourlyTroveDataSummary),
}));

export const troveDataRelations = relations(troveData, ({ one }) => ({
  troveManager: one(troveManagers, {
    fields: [troveData.troveManagerPk],
    references: [troveManagers.pk],
  }),
  owner: one(troveOwners, {
    fields: [troveData.troveId, troveData.troveManagerPk],
    references: [troveOwners.troveId, troveOwners.troveManagerPk],
  }),
}));

export const troveOwnersRelations = relations(troveOwners, ({ one, many }) => ({
  troves: many(troveData),
  troveManager: one(troveManagers, {
    fields: [troveOwners.troveManagerPk],
    references: [troveManagers.pk],
  }),
}));

export const eventDataRelations = relations(eventData, ({ one }) => ({
  troveManager: one(troveManagers, {
    fields: [eventData.troveManagerPk],
    references: [troveManagers.pk],
  }),
}));

export const coreImmutablesRelations = relations(coreImmutables, ({ one }) => ({
  protocol: one(protocols, {
    fields: [coreImmutables.protocolPk],
    references: [protocols.pk],
  }),
}));

export const coreColImmutablesRelations = relations(coreColImmutables, ({ one }) => ({
  troveManager: one(troveManagers, {
    fields: [coreColImmutables.troveManagerPk],
    references: [troveManagers.pk],
  }),
}));

export const corePoolDataRelations = relations(corePoolData, ({ one }) => ({
  protocol: one(protocols, {
    fields: [corePoolData.protocolPk],
    references: [protocols.pk],
  }),
}));

export const colPoolDataRelations = relations(colPoolData, ({ one }) => ({
  troveManager: one(troveManagers, {
    fields: [colPoolData.troveManagerPk],
    references: [troveManagers.pk],
  }),
}));

export const pricesAndRatesRelations = relations(pricesAndRates, ({ one }) => ({
  troveManager: one(troveManagers, {
    fields: [pricesAndRates.troveManagerPk],
    references: [troveManagers.pk],
  }),
}));

export const troveManagerTimeSamplePointsRelations = relations(troveManagerTimeSamplePoints, ({ one }) => ({
  troveManager: one(troveManagers, {
    fields: [troveManagerTimeSamplePoints.troveManagerPk],
    references: [troveManagers.pk],
  }),
}));

export const protocolTimeSamplePointsRelations = relations(protocolTimeSamplePoints, ({ one }) => ({
  protocol: one(protocols, {
    fields: [protocolTimeSamplePoints.protocolPk],
    references: [protocols.pk],
  }),
}));

export const hourlyTroveDataSummaryRelations = relations(hourlyTroveDataSummary, ({ one }) => ({
  troveManager: one(troveManagers, {
    fields: [hourlyTroveDataSummary.troveManagerPk],
    references: [troveManagers.pk],
  }),
}));

const tables = {
  protocols,
  troveManagers,
  troveData,
  troveOwners,
  eventData,
  coreImmutables,
  coreColImmutables,
  corePoolData,
  colPoolData,
  errorLogs,
  recordedBlocks,
  blockTimestamps,
  pricesAndRates,
  troveManagerTimeSamplePoints,
  protocolTimeSamplePoints,
  hourlyTroveDataSummary,
};

export type TableName =
  | "protocols"
  | "troveManagers"
  | "troveData"
  | "troveOwners"
  | "eventData"
  | "coreImmutables"
  | "coreColImmutables"
  | "corePoolData"
  | "colPoolData"
  | "errorLogs"
  | "recordedBlocks"
  | "blockTimestamps"
  | "pricesAndRates"
  | "troveManagerTimeSamplePoints"
  | "protocolTimeSamplePoints"
  | "hourlyTroveDataSummary";

export function getTable(tableName: TableName): PgTableWithColumns<any> {
  const table = tables[tableName as keyof typeof tables];
  if (!table) {
    throw new Error(`Table ${tableName} does not exist`);
  }
  return table;
}
