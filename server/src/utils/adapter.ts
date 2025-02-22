import * as sdk from "@defillama/sdk";
import { getLatestBlock } from "@defillama/sdk/build/util";
import { Chain } from "@defillama/sdk/build/general";
import protocols from "../data/protocolData";
import adapters from "../adapters";
import { maxBlocksToQueryByChain } from "./constants";
import { store } from "./s3";
import { Adapter } from "./adapter.type";
import { getCurrentUnixTimestamp } from "./date";
import type { CorePoolDataEntry, RecordedBlocks, TroveDataEntry, CoreImmutablesEntry, EventDataEntry } from "./types";
import { wait } from "./etherscan";
import { lookupBlock } from "@defillama/sdk/build/util";
import { Protocol } from "../data/types";
import testRecordedBlocks from "./testRecordedBlocks.json";
import retry from "async-retry";
const fs = require("fs");
import { ErrorLoggerService } from "./bunyan";
import { insertEntriesFromAdapter } from "../db/write";
import { InsertOptions } from "../db/types";
import { withTimeout } from "./async";

export const runAdapterToCurrentBlock = async (
  protocol: Protocol,
  insertOptions: InsertOptions,
  updateImmutables: boolean = false
) => {
  console.log(`Running adapter for protocol ${protocol.displayName}`);

  await runAdapterSnapshot(protocol, insertOptions, updateImmutables);
  await runTroveOperationsToCurrentBlock(protocol, insertOptions);
};

async function getLatestBlockWithLogging(
  chain: string,
  logger: ErrorLoggerService,
  id: number,
  table: string
): Promise<number> {
  try {
    const { number } = await retry(async () => withTimeout(getLatestBlock(chain), { milliseconds: 30000 }), {
      retries: 2,
    });
    return number;
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      keyword: "missingBlocks",
      table: table,
      chain,
      protocolId: id,
    });
    throw error;
  }
}

const getBlocksForRunningAdapter = async (protocolDbName: string, chain: string, recordedBlocks: RecordedBlocks) => {
  let startBlock = undefined;
  let endBlock = undefined;

  try {
    const { number } = await retry(
      async () => {
        return await withTimeout(getLatestBlock(chain), { milliseconds: 30000 });
      },
      {
        retries: 3,
      }
    );
    endBlock = number;
  } catch (e) {
    return { startBlock, endBlock };
  }

  const maxBlocksToQuery = maxBlocksToQueryByChain[chain] ?? maxBlocksToQueryByChain.default * 10;
  let lastRecordedEndBlock = recordedBlocks[`${protocolDbName}:${chain}`]?.endBlock;
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
  console.log(`Getting snapshot for protocol ${protocol.displayName}`);
  const logger = ErrorLoggerService.getInstance();
  const { id, protocolDbName } = protocol;

  const adapter = await importAdapter(protocolDbName, id, logger);

  const finalInsertOptions: InsertOptions = {
    allowNullDbValues: false,
    onConflict: "error",
    retryCount: 2,
    retryDelay: 2000,
    ...insertOptions,
  };

  if (adapter.fetchTroves) {
    const fetchTrovesFns = adapter.fetchTroves;
    console.log("Fetching Troves");
    await Promise.all(
      Object.entries(fetchTrovesFns).map(async ([chain, fetchTrovesFn]) => {
        try {
          const blockNumber = await getLatestBlockWithLogging(chain, logger, id, "troveData");
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
              retries: 2,
            }
          );
          // console.dir(troveDataEntries, { depth: null });
          await insertEntriesFromAdapter("fetchTroves", troveDataEntries, finalInsertOptions);
        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : String(error),
            keyword: "critical",
            table: "troveData",
            chain: chain,
            protocolId: id,
          });
          throw error;
        }
      })
    );
  }

  if (adapter.fetchImmutables && updateImmutables) {
    const fetchImmutablesFns = adapter.fetchImmutables;
    console.log("Fetching Immutables");
    await Promise.all(
      Object.entries(fetchImmutablesFns).map(async ([chain, fetchImmutablesFn]) => {
        try {
          const blockNumber = await getLatestBlockWithLogging(chain, logger, id, "troveData");
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
              retries: 2,
            }
          );
          await insertEntriesFromAdapter("fetchImmutables", [coreImmutablesEntry], finalInsertOptions);
        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : String(error),
            keyword: "critical",
            table: "coreImmutables",
            chain: chain,
            protocolId: id,
          });
          throw error;
        }
      })
    );
  }

  if (adapter.fetchCorePoolData) {
    const fetchCorePoolDataFns = adapter.fetchCorePoolData;
    console.log("Fetching Core pool data");
    await Promise.all(
      Object.entries(fetchCorePoolDataFns).map(async ([chain, fetchCorePoolDataFn]) => {
        try {
          const blockNumber = await getLatestBlockWithLogging(chain, logger, id, "troveData");
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
              retries: 2,
            }
          );
          await insertEntriesFromAdapter("fetchCorePoolData", [corePoolDataEntry], finalInsertOptions);
        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : String(error),
            keyword: "critical",
            table: "corePoolData",
            chain: chain,
            protocolId: id,
          });
          throw error;
        }
      })
    );
  }
};

export const runTroveOperationsToCurrentBlock = async (protocol: Protocol, insertOptions: InsertOptions) => {
  console.log(`Getting trove operations for ${protocol.id} ${protocol.protocolDbName}`);
  const logger = ErrorLoggerService.getInstance();
  const { id, protocolDbName } = protocol;

  const adapter = await importAdapter(protocolDbName, id, logger);

  const finalInsertOptions: InsertOptions = {
    allowNullDbValues: false,
    onConflict: "error",
    retryCount: 2,
    retryDelay: 2000,
    ...insertOptions,
  };

  const recordedBlocks = testRecordedBlocks as RecordedBlocks;
  /*
  const recordedBlocksFilename = `blocks-${bridgeDbName}.json`;
  const recordedBlocks = (
    await retry(
      async (_bail: any) =>
        await axios.get(`https://llama-bridges-data.s3.eu-central-1.amazonaws.com/${recordedBlocksFilename}`)
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
    */

  const fetchTroveOperationsFns = adapter.fetchTroveOperations;
  if (!fetchTroveOperationsFns) {
    const errString = `Adapter for ${protocolDbName} does not have fetchTroveOperations function.`;
    logger.error({ error: errString, keyword: "critical", protocolId: id });
    throw new Error(errString);
  }

  await Promise.allSettled(
    Object.keys(fetchTroveOperationsFns).map(async (chain, i) => {
      await wait(100 * i); // attempt to space out API calls
      try {
        const { startBlock, endBlock } = await getBlocksForRunningAdapter(protocolDbName, chain, recordedBlocks);
        if (startBlock == null) {
          const errString = `Unable to get blocks for ${protocolDbName} adapter on chain ${chain}.`;
          logger.error({ error: errString, keyword: "missingBlocks", protocolId: id, chain: chain });
          throw new Error(errString);
        }
        await runTroveOperationsHistorical(startBlock, endBlock, protocol, chain as Chain, finalInsertOptions, true);
        console.log("endblock", endBlock);

        /*
        recordedBlocks[`${protocolDbName}:${chain}`] = recordedBlocks[`${protocolDbName}:${chain}`] || {};
        recordedBlocks[`${protocolDbName}:${chain}`].startBlock =
          recordedBlocks[`${protocolDbName}:${chain}`]?.startBlock ?? startBlock;
        recordedBlocks[`${protocolDbName}:${chain}`].endBlock = endBlock;
        */
      } catch (e) {
        const errString = `Trove operations for ${protocolDbName} on chain ${chain} failed, skipped, ${e}`;
        logger.error({ error: errString, keyword: "critical", protocolId: id, chain: chain });
        console.error(errString);
        return null;
      }
    })
  );

  // await store(recordedBlocksFilename, JSON.stringify(recordedBlocks));
  fs.writeFileSync("./testRecordedBlocks.json", JSON.stringify(recordedBlocks, null, 2));
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
            return {
              protocolId: id,
              ...event,
            } as EventDataEntry;
          });
        },
        {
          retries: 2,
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

      await insertEntriesFromAdapter("fetchTroveOperations", eventDataEntries, insertOptions);
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
