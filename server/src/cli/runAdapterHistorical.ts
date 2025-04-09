import { lookupBlock } from "@defillama/sdk/build/util";
import { importProtocol } from "../data/importProtocol";
import { wait } from "../utils/etherscan";
import { runTroveOperationsHistorical } from "../utils/adapter";
import { PromisePool } from "@supercharge/promise-pool";
import { getRecordedBlocksByProtocolId } from "../db/read";
import { insertRecordedBlockEntries } from "../db/write";
import { RecordedBlocksEntryWithChain } from "../utils/types";

const protocolId = parseInt(process.argv[2], 10);
const startTimestamp = parseInt(process.argv[3], 10);
const endTimestamp = parseInt(process.argv[4], 10);

async function fillAdapterHistorical(
  startTimestamp: number,
  endTimestamp: number,
  protocolDbName?: string,
  protocolId?: number
) {
  const protocolData = importProtocol(protocolDbName, protocolId);
  if (!protocolData) throw new Error("Protocol not found in protocolData");
  console.log(
    `Attempting to fill adapter for ${protocolData.protocolDbName} from ${startTimestamp} to ${endTimestamp}.`
  );

  const recordedBlocksList = await getRecordedBlocksByProtocolId(protocolData.id);
  let recordedBlockEntries: RecordedBlocksEntryWithChain[] = [];

  const { results, errors } = await PromisePool.for(protocolData.chains).process(async (chain, i) => {
    console.log(`Running adapter for ${chain} for ${protocolData.protocolDbName}`);
    await wait(500 * i);
    const startBlock = (await lookupBlock(startTimestamp, { chain: chain })).number;
    const endBlock = (await lookupBlock(endTimestamp, { chain: chain })).number;

    const recordedBlocksEntry = recordedBlocksList.find((entry) => entry.chain === chain);

    if (!recordedBlocksEntry) {
      console.warn(
        `Warning: No recorded blocks found for ${protocolData.protocolDbName} on chain ${chain}. Starting fresh.`
      );
    }

    let isValidRange = true;
    if (recordedBlocksEntry) {
      if (startBlock >= recordedBlocksEntry.endBlock) {
        console.warn(
          `Warning: startBlock (${startBlock}) is not less than current endBlock (${recordedBlocksEntry.endBlock}) for chain ${chain}`
        );
        isValidRange = false;
      }
      if (endBlock <= recordedBlocksEntry.endBlock) {
        console.warn(
          `Warning: endBlock (${endBlock}) is not greater than current endBlock (${recordedBlocksEntry.endBlock}) for chain ${chain}`
        );
        isValidRange = false;
      }
    }

    try {
      await runTroveOperationsHistorical(startBlock, endBlock, protocolData, chain, {
        allowNullDbValues: false,
        onConflict: "ignore",
      });

      if (isValidRange) {
        recordedBlockEntries.push({
          protocolId: protocolData.id,
          chain: chain,
          startBlock: recordedBlocksEntry?.startBlock || startBlock,
          endBlock: endBlock,
        });
      }

      return { chain, success: true };
    } catch (error) {
      console.error(`Error processing chain ${chain}: ${error instanceof Error ? error.message : String(error)}`);
      return { chain, success: false, error };
    }
  });

  if (errors.length > 0) {
    errors.forEach((err, idx) => {
      console.error(`Error ${idx + 1}`, err || "");
    });
    throw new Error(`Encountered ${errors.length} error(s) during processing.`);
  }

  if (recordedBlockEntries.length > 0) {
    await insertRecordedBlockEntries(recordedBlockEntries);
    console.log(`Updated recorded blocks for ${recordedBlockEntries.length} chains`);
  } else {
    console.log("No recorded blocks were updated. This may be because the block ranges were invalid.");
  }

  console.log(`Finished running adapter from ${startTimestamp} to ${endTimestamp} for ${protocolData.protocolDbName}`);
  return { success: true, failedChains: results.filter((r) => !r.success).map((r) => r.chain) };
}

(async () => {
  const result = await fillAdapterHistorical(startTimestamp, endTimestamp, undefined, protocolId);
  if (!result.success) {
    process.exit(1);
  }
})();
