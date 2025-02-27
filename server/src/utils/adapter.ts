import * as sdk from "@defillama/sdk";
import { getLatestBlock } from "@defillama/sdk/build/util";
import { Block } from "@defillama/sdk/build/util/blocks";
import { Chain } from "@defillama/sdk/build/general";
import db from "../db/db";
import adapters from "../adapters";
import { maxBlocksToQueryByChain } from "./constants";
import type {
  CorePoolDataEntry,
  RecordedBlocksEntryWithChain,
  TroveDataEntry,
  CoreImmutablesEntry,
  EventDataEntry,
} from "./types";
import { wait } from "./etherscan";
import { Protocol } from "../data/types";
import retry from "async-retry";
import { ErrorLoggerService } from "./bunyan";
import { insertEntriesFromAdapter, insertRecordedBlockEntries, insertBlockTimestampEntries } from "../db/write";
import { getRecordedBlocksByProtocolId } from "../db/read";
import { InsertOptions } from "../db/types";
import { withTimeout } from "./async";
import { getLatestBlockWithLogging } from "./blocks";

export const runAdapterToCurrentBlock = async (
  protocol: Protocol,
  insertOptions: InsertOptions,
  _updateImmutables: boolean = false
) => {
  console.log(`Running adapter for protocol ${protocol.displayName}`);

  //await runAdapterSnapshot(protocol, insertOptions, updateImmutables);
  await runTroveOperationsToCurrentBlock(protocol, insertOptions);
};

const getBlocksForRunningAdapter = async (
  protocolDbName: string,
  chain: string,
  recordedBlocks: RecordedBlocksEntryWithChain
) => {
  let startBlock = undefined;
  let endBlock = undefined;

  try {
    const { number } = await retry(
      async () => {
        return await withTimeout(getLatestBlock(chain), { milliseconds: 30000 });
      },
      {
        retries: 2,
      }
    );
    endBlock = number;
  } catch (e) {
    return { startBlock, endBlock };
  }

  const maxBlocksToQuery = maxBlocksToQueryByChain[chain] ?? maxBlocksToQueryByChain.default * 10;
  let lastRecordedEndBlock = recordedBlocks.endBlock;
  if (!lastRecordedEndBlock) {
    const defaultStartBlock = endBlock - maxBlocksToQuery;
    lastRecordedEndBlock = defaultStartBlock;
    console.log(
      `Adapter for ${protocolDbName} is missing recordedBlocks entry for chain ${chain}. Starting at block ${
        lastRecordedEndBlock + 1
      }.`
    );
  }
  startBlock = lastRecordedEndBlock + 1;
  if (endBlock - startBlock > maxBlocksToQuery) {
    endBlock = startBlock + maxBlocksToQuery;
  }

  return { startBlock, endBlock };
};

const importAdapter = async (protocolDbName: string, id: number, logger: ErrorLoggerService) => {
  const adapter = adapters[protocolDbName];
  if (!adapter) {
    const errString = `Adapter for ${protocolDbName} not found, check it is exported correctly.`;
    logger.error({ error: errString, keyword: "critical", protocolId: id });
    throw new Error(errString);
  }
  return adapter;
};

export const runAdapterSnapshot = async (
  protocol: Protocol,
  insertOptions: InsertOptions,
  updateImmutables: boolean = false
) => {
  const { id, protocolDbName } = protocol;
  console.log(`Getting snapshot for ${id} ${protocolDbName}`);
  const logger = ErrorLoggerService.getInstance();

  const adapter = await importAdapter(protocolDbName, id, logger);

  const finalInsertOptions: InsertOptions = {
    allowNullDbValues: false,
    onConflict: "error",
    retryCount: 1,
    retryDelay: 2000,
    ...insertOptions,
  };

  if (adapter.fetchTroves) {
    const fetchTrovesFns = adapter.fetchTroves;
    console.log("Fetching Troves");
    await Promise.allSettled(
      Object.entries(fetchTrovesFns).map(async ([chain, fetchTrovesFn]) => {
        try {
          const block = await getLatestBlockWithLogging(chain, logger, id, "troveData");
          const { number: blockNumber, timestamp: blockTimestamp } = block;
          let troveDataEntries: TroveDataEntry[] = [];
          await retry(
            async () => {
              const troveData = await fetchTrovesFn(
                new sdk.ChainApi({
                  chain: chain,
                })
              );
              troveDataEntries = troveData.map((trove) => {
                return {
                  protocolId: id,
                  blockNumber: blockNumber,
                  getTroveManagerIndex: trove.getTroveManagerIndex,
                  chain: chain,
                  troveData: trove.troveData,
                };
              });
            },
            {
              retries: 1,
            }
          );
          await db.transaction(async (trx) => {
            await insertEntriesFromAdapter("fetchTroves", troveDataEntries, finalInsertOptions, trx);
            await insertBlockTimestampEntries(
              chain,
              [{ blockNumber, timestamp: blockTimestamp }],
              finalInsertOptions,
              trx
            );
          });
        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : String(error),
            keyword: "missingValues",
            table: "troveData",
            chain: chain,
            protocolId: id,
          });
          console.error(`Fetching troves for ${protocolDbName} on chain ${chain} failed, skipped.`);
        }
      })
    );
  }

  if (adapter.fetchImmutables && updateImmutables) {
    const fetchImmutablesFns = adapter.fetchImmutables;
    console.log("Fetching Immutables");
    await Promise.allSettled(
      Object.entries(fetchImmutablesFns).map(async ([chain, fetchImmutablesFn]) => {
        try {
          const block = await getLatestBlockWithLogging(chain, logger, id, "coreImmutables");
          const { number: blockNumber, timestamp: blockTimestamp } = block;
          let coreImmutablesEntry = {} as CoreImmutablesEntry;
          await retry(
            async () => {
              const coreImmutables = await fetchImmutablesFn(
                new sdk.ChainApi({
                  chain: chain,
                })
              );
              coreImmutablesEntry = {
                protocolId: id,
                blockNumber: blockNumber,
                chain: chain,
                ...coreImmutables,
              };
            },
            {
              retries: 1,
            }
          );
          await db.transaction(async (trx) => {
            await insertEntriesFromAdapter("fetchImmutables", [coreImmutablesEntry], finalInsertOptions, trx);
            await insertBlockTimestampEntries(
              chain,
              [{ blockNumber, timestamp: blockTimestamp }],
              finalInsertOptions,
              trx
            );
          });
        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : String(error),
            keyword: "missingValues",
            table: "coreImmutables",
            chain: chain,
            protocolId: id,
          });
          console.error(`Fetching immutables for ${protocolDbName} on chain ${chain} failed, skipped.`);
        }
      })
    );
  }

  if (adapter.fetchCorePoolData) {
    const fetchCorePoolDataFns = adapter.fetchCorePoolData;
    console.log("Fetching Core pool data");
    await Promise.allSettled(
      Object.entries(fetchCorePoolDataFns).map(async ([chain, fetchCorePoolDataFn]) => {
        try {
          const block = await getLatestBlockWithLogging(chain, logger, id, "corePoolData");
          const { number: blockNumber, timestamp: blockTimestamp } = block;
          let corePoolDataEntry = {} as CorePoolDataEntry;
          await retry(
            async () => {
              const corePoolData = await fetchCorePoolDataFn(
                new sdk.ChainApi({
                  chain: chain,
                })
              );
              corePoolDataEntry = {
                protocolId: id,
                blockNumber: blockNumber,
                chain: chain,
                baseRate: corePoolData.baseRate,
                getRedemptionRate: corePoolData.getRedemptionRate,
                totalCollaterals: corePoolData.totalCollaterals,
                collateralPoolData: corePoolData.collateralPoolData,
              };
            },
            {
              retries: 1,
            }
          );
          await db.transaction(async (trx) => {
            await insertEntriesFromAdapter("fetchCorePoolData", [corePoolDataEntry], finalInsertOptions, trx);
            await insertBlockTimestampEntries(
              chain,
              [{ blockNumber, timestamp: blockTimestamp }],
              finalInsertOptions,
              trx
            );
          });
        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : String(error),
            keyword: "missingValues",
            table: "corePoolData",
            chain: chain,
            protocolId: id,
          });
          console.error(`Fetching Core pool data for ${protocolDbName} on chain ${chain} failed, skipped.`);
        }
      })
    );
  }
};

export const runTroveOperationsToCurrentBlock = async (protocol: Protocol, insertOptions: InsertOptions) => {
  const { id, protocolDbName } = protocol;
  console.log(`Getting trove operations for ${id} ${protocolDbName}`);
  const logger = ErrorLoggerService.getInstance();

  const adapter = await importAdapter(protocolDbName, id, logger);

  const finalInsertOptions: InsertOptions = {
    allowNullDbValues: false,
    onConflict: "error",
    retryCount: 1,
    retryDelay: 2000,
    ...insertOptions,
  };

  const recordedBlocksList = await getRecordedBlocksByProtocolId(id);

  const fetchTroveOperationsFns = adapter.fetchTroveOperations;
  if (!fetchTroveOperationsFns) {
    const errString = `Adapter for ${protocolDbName} does not have fetchTroveOperations function.`;
    logger.error({ error: errString, keyword: "critical", protocolId: id });
    throw new Error(errString);
  }

  let recordedBlockEntries = [] as RecordedBlocksEntryWithChain[];
  await Promise.allSettled(
    Object.keys(fetchTroveOperationsFns).map(async (chain, i) => {
      await wait(100 * i); // attempt to space out API calls
      try {
        const recordedBlocksEntry = recordedBlocksList.find((entry) => entry.chain === chain);
        if (!recordedBlocksEntry) {
          const errString = `No recorded blocks found for ${protocolDbName} on chain ${chain}.`;
          logger.error({ error: errString, keyword: "missingBlocks", protocolId: id, chain: chain });
          throw new Error(errString);
        }
        const { startBlock, endBlock } = await getBlocksForRunningAdapter(protocolDbName, chain, recordedBlocksEntry);
        if (startBlock == null) {
          const errString = `Unable to get blocks for ${protocolDbName} adapter on chain ${chain}.`;
          logger.error({ error: errString, keyword: "missingBlocks", protocolId: id, chain: chain });
          throw new Error(errString);
        }
        await runTroveOperationsHistorical(startBlock, endBlock, protocol, chain as Chain, finalInsertOptions, true);
        console.log("endblock", endBlock);

        recordedBlockEntries.push({
          ...recordedBlocksEntry,
          endBlock: endBlock,
        });
      } catch (e) {
        const errString = `Trove operations for ${protocolDbName} on chain ${chain} failed, skipped, ${e}`;
        logger.error({ error: errString, keyword: "missingValues", protocolId: id, chain: chain });
        console.error(errString);
        return null;
      }
    })
  );

  await insertRecordedBlockEntries(recordedBlockEntries);

  console.log(`runTroveOperationsToCurrentBlock for ${protocol.displayName} successfully ran.`);
};

/*

export const runAllAdaptersToCurrentBlock = async (
  allowNullTxValues: boolean = false,
  onConflict: "ignore" | "error" | "upsert" = "error"
) => {
  const currentTimestamp = getCurrentUnixTimestamp() * 1000;
  const recordedBlocks = (
    await retry(
      async (_bail: any) =>
        await axios.get("https://llama-bridges-data.s3.eu-central-1.amazonaws.com/recordedBlocks.json")
    )
  ).data as RecordedBlocks;
  if (!recordedBlocks) {
    const errString = `Unable to retrieve recordedBlocks from s3.`;
    await insertErrorRow({
      ts: currentTimestamp,
      target_table: "transactions",
      keyword: "critical",
      error: errString,
    });
    throw new Error(errString);
  }

  for (const bridgeNetwork of bridgeNetworks) {
    const { id, bridgeDbName } = bridgeNetwork;
    const adapter = adapters[bridgeDbName];
    if (!adapter) {
      const errString = `Adapter for ${bridgeDbName} not found, check it is exported correctly.`;
      await insertErrorRow({
        ts: currentTimestamp,
        target_table: "transactions",
        keyword: "critical",
        error: errString,
      });
      throw new Error(errString);
    }
    await insertConfigEntriesForAdapter(adapter, bridgeDbName);
    const adapterPromises = Promise.all(
      Object.keys(adapter).map(async (chain, i) => {
        await wait(100 * i); // attempt to space out API calls
        const chainContractsAreOn = bridgeNetwork.chainMapping?.[chain as Chain]
          ? bridgeNetwork.chainMapping?.[chain as Chain]
          : chain;
        const { startBlock, endBlock, useRecordedBlocks } = await getBlocksForRunningAdapter(
          bridgeDbName,
          chain,
          chainContractsAreOn,
          recordedBlocks
        );
        if (startBlock == null) return;
        try {
          await runAdapterHistorical(startBlock, endBlock, id, chain as Chain, allowNullTxValues, true, onConflict);
          if (useRecordedBlocks) {
            recordedBlocks[`${bridgeDbName}:${chain}`] = recordedBlocks[`${bridgeDbName}:${chain}`] || {};
            recordedBlocks[`${bridgeDbName}:${chain}`].startBlock =
              recordedBlocks[`${bridgeDbName}:${chain}`]?.startBlock ?? startBlock;
            recordedBlocks[`${bridgeDbName}:${chain}`].endBlock = endBlock;
          }
        } catch (e) {
          const errString = `Adapter txs for ${bridgeDbName} on chain ${chain} failed, skipped.`;
          await insertErrorRow({
            ts: currentTimestamp,
            target_table: "transactions",
            keyword: "data",
            error: errString,
          });
          console.error(errString, e);
        }
      })
    );
    await adapterPromises;
  }
  // need better error catching
  await store("recordedBlocks.json", JSON.stringify(recordedBlocks));
  console.log("runAllAdaptersToCurrentBlock successfully ran.");
};

export const runAllAdaptersTimestampRange = async (
  allowNullTxValues: boolean = false,
  onConflict: "ignore" | "error" | "upsert" = "error",
  startTimestamp: number,
  endTimestamp: number
) => {
  for (const bridgeNetwork of bridgeNetworks) {
    const { id, bridgeDbName } = bridgeNetwork;
    const adapter = adapters[bridgeDbName];
    if (!adapter) {
      const errString = `Adapter for ${bridgeDbName} not found, check it is exported correctly.`;
      await insertErrorRow({
        ts: getCurrentUnixTimestamp() * 1000,
        target_table: "transactions",
        keyword: "critical",
        error: errString,
      });
      throw new Error(errString);
    }
    await insertConfigEntriesForAdapter(adapter, bridgeDbName);
    const adapterPromises = Promise.all(
      Object.keys(adapter).map(async (chain, i) => {
        await wait(100 * i); // attempt to space out API calls
        const chainContractsAreOn = bridgeNetwork.chainMapping?.[chain as Chain]
          ? bridgeNetwork.chainMapping?.[chain as Chain]
          : chain;
        if (chainContractsAreOn === "tron") {
          console.info(`Skipping running adapter ${bridgeDbName} on chain Tron.`);
          return;
        }
        const useChainBlocks = !(nonBlocksChains.includes(chainContractsAreOn) || ["ibc"].includes(bridgeDbName));
        try {
          let startBlock = 0;
          let endBlock = 1;
          if (useChainBlocks) {
            startBlock = (await lookupBlock(startTimestamp, { chain: chainContractsAreOn as Chain })).block;
            endBlock = (await lookupBlock(endTimestamp, { chain: chainContractsAreOn as Chain })).block;
          }
          await runAdapterHistorical(startBlock, endBlock, id, chain as Chain, allowNullTxValues, true, onConflict);
        } catch (e) {
          const errString = `Adapter txs for ${bridgeDbName} on chain ${chain} failed, skipped.`;
          await insertErrorRow({
            ts: getCurrentUnixTimestamp() * 1000,
            target_table: "transactions",
            keyword: "data",
            error: errString,
          });
          console.error(errString, e);
        }
      })
    );
    await adapterPromises;
  }
  // need better error catching
  console.log("runAllAdaptersTimestampRange successfully ran.");
};
*/

export const runTroveOperationsHistorical = async (
  startBlock: number,
  endBlock: number,
  protocol: Protocol,
  chain: string, // needed because different chains query over different block ranges
  insertOptions: InsertOptions,
  throwOnFailedInsert: boolean = true
) => {
  const logger = ErrorLoggerService.getInstance();

  const { id, protocolDbName } = protocol;
  const adapter = await importAdapter(protocolDbName, id, logger);

  const adapterTroveOperationsFn = adapter.fetchTroveOperations?.[chain];
  if (!adapterTroveOperationsFn) {
    const errString = `Chain ${chain} not found on adapter ${protocolDbName}.`;
    logger.error({ error: errString, keyword: "critical", protocolId: id });
    throw new Error(errString);
  }

  const maxBlocksToQuery = maxBlocksToQueryByChain[chain]
    ? maxBlocksToQueryByChain[chain]
    : maxBlocksToQueryByChain.default;
  let block = endBlock;
  console.log(
    `Searching for trove operations for protocol ${id} (${protocolDbName}-${chain}) from ${startBlock} to ${block}.`
  );
  while (block > startBlock) {
    const startBlockForQuery = Math.max(startBlock, block - maxBlocksToQuery);
    try {
      const blockNumbers = new Set<number>();
      const eventDataEntries = await retry(
        async () => {
          const eventData = await adapterTroveOperationsFn(
            startBlockForQuery,
            block,
            new sdk.ChainApi({
              chain: chain,
            })
          );

          return eventData.map((event) => {
            if (event.getTroveManagerIndex == null) {
              throw new Error(`getTroveManagerIndex not found in event data for ${id} ${protocolDbName}-${chain}`);
            }
            blockNumbers.add(event.blockNumber);
            return {
              protocolId: id,
              ...event,
            } as EventDataEntry;
          });
        },
        {
          retries: 1,
        }
      );

      if (eventDataEntries.length === 0) {
        console.log(`No events found for ${id} (${protocolDbName}-${chain}) from ${startBlockForQuery} to ${block}.`);
        block = startBlockForQuery - 1;
        continue;
      }
      console.log(
        `${eventDataEntries.length} events were found for ${id} (${protocolDbName}-${chain}) from ${startBlockForQuery} to ${block}.`
      );
      const blockNumberList = Array.from(blockNumbers).map((blockNumber) => ({ blockNumber }));
      await db.transaction(async (trx) => {
        await insertEntriesFromAdapter("fetchTroveOperations", eventDataEntries, insertOptions, trx);
        await insertBlockTimestampEntries(chain, blockNumberList, insertOptions, trx);
      });

      console.log("finished inserting trove operations");
    } catch (e) {
      const errString = `Adapter for ${protocolDbName} failed to get and insert logs for chain ${chain} for blocks ${startBlockForQuery}-${block}. ${e}`;

      if (throwOnFailedInsert) {
        throw new Error(errString);
      }
      console.error(errString, e);
    }
    block = startBlockForQuery - 1;
  }
  console.log(`Finished inserting all trove operations for ${id} (${protocolDbName}-${chain})`);
};
