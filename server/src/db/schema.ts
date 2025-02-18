import { pgTable as table, PgTableWithColumns } from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";
import * as d from "drizzle-orm/pg-core";

export const protocols = table(
  "protocols",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    protocolId: d.integer().notNull(),
    chain: d.varchar({ length: 32 }).notNull(),
  },
  (protocols) => [d.unique("protocols_protocol_id_chain_unique").on(protocols.protocolId, protocols.chain)]
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
    coll: d.varchar({ length: 96 }).notNull(),
    stake: d.varchar({ length: 96 }).notNull(),
    /* Status: 0=nonExistent, 1=active, 2=closedByOwner, 3=closedByLiquidation, 4=zombie */
    status: d.integer().notNull(),
    arrayIndex: d.integer().notNull(),
    lastDebtUpdateTime: d.varchar({ length: 96 }).notNull(),
    lastInterestRateAdjTime: d.varchar({ length: 96 }).notNull(),
    annualInterestRate: d.varchar({ length: 96 }).notNull(),
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
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    protocolPk: d
      .integer()
      .references(() => protocols.pk, { onDelete: "cascade" })
      .notNull(),
    blockNumber: d.integer().notNull(),
    boldToken: d.varchar({ length: 42 }).notNull(),
    collateralRegistry: d.varchar({ length: 42 }).notNull(),
    interestRouter: d.varchar({ length: 42 }).notNull(),
  },
  (coreImmutables) => [
    d
      .uniqueIndex("core_immutables_block_number_protocol_id_unique_idx")
      .on(coreImmutables.blockNumber, coreImmutables.protocolPk),
  ]
);

export const coreColImmutables = table(
  "core_col_immutables",
  {
    pk: d.integer().primaryKey().generatedAlwaysAsIdentity(),
    troveManagerPk: d
      .integer()
      .references(() => troveManagers.pk, { onDelete: "cascade" })
      .notNull(),
    blockNumber: d.integer().notNull(),
    CCR: d.varchar({ length: 96 }).notNull(),
    SCR: d.varchar({ length: 96 }).notNull(),
    MCR: d.varchar({ length: 96 }).notNull(),
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
      .on(coreColImmutables.blockNumber, coreColImmutables.troveManagerPk),
  ]
);

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
    getCollBalance: d.varchar({ length: 96 }).notNull(),
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

export const protocolsRelations = relations(protocols, ({ one }) => ({
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
}));

export const troveDataRelations = relations(troveData, ({ one }) => ({
  troveManager: one(troveManagers, {
    fields: [troveData.troveManagerPk],
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

const tables = {
  protocols: protocols,
  troveManagers: troveManagers,
  troveData: troveData,
  eventData: eventData,
  coreImmutables: coreImmutables,
  coreColImmutables: coreColImmutables,
  corePoolData: corePoolData,
  colPoolData: colPoolData,
  errorLogs: errorLogs,
};

export type TableName =
  | "protocols"
  | "troveManagers"
  | "troveData"
  | "coreImmutables"
  | "coreColImmutables"
  | "corePoolData"
  | "colPoolData"
  | "errorLogs";

export function getTable(tableName: TableName): PgTableWithColumns<any> {
  const table = tables[tableName as keyof typeof tables];
  if (!table) {
    throw new Error(`Table ${tableName} does not exist`);
  }
  return table;
}
