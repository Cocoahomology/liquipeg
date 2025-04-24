import { wrapScheduledLambda } from "../utils/wrap";
import * as sdk from "@defillama/sdk";
import retry from "async-retry";
import { withTimeout } from "../utils/async";
import { getBlocksWithMissingTimestamps } from "../db/read";
import { PromisePool } from "@supercharge/promise-pool";
import { insertBlockTimestampEntries } from "../db/write";
import { maxBlocksToQueryByChain } from "../utils/constants";

const handler = async (_event: any) => {
  const blockTimestampEntries = await getBlocksWithMissingTimestamps();

  console.log(`Total chains with missing timestamps: ${Object.keys(blockTimestampEntries).length}`);
  let totalEntries = 0;
  Object.values(blockTimestampEntries).forEach((entries) => {
    totalEntries += entries.length;
  });
  console.log(`Total block entries with missing timestamps: ${totalEntries}`);

  await Promise.allSettled(
    Object.entries(blockTimestampEntries).map(async ([chain, blockEntries]) => {
      // Limit to first 600 entries
      const limitedBlockEntries = blockEntries.slice(0, 600);
      console.log(
        `Processing chain ${chain}: ${limitedBlockEntries.length} of ${blockEntries.length} entries (limited to 600)`
      );

      const provider = await sdk.getProvider(chain);
      const blockTimestamps = {} as Record<number, number>;
      const minBlockInterval = Math.floor((maxBlocksToQueryByChain[chain] || maxBlocksToQueryByChain.default) / 10);

      let lastTimestamp: number | null = null;
      let lastBlockNumber: number | null = null;

      await PromisePool.for(limitedBlockEntries)
        .withConcurrency(2) // FIX: adjust
        .process(async (entry) => {
          const blockNumber = entry.blockNumber;

          if (!blockTimestamps[blockNumber]) {
            if (
              lastBlockNumber !== null &&
              lastTimestamp !== null &&
              blockNumber - lastBlockNumber < minBlockInterval
            ) {
              // Reuse the last timestamp for nearby blocks
              blockTimestamps[blockNumber] = lastTimestamp;
            } else {
              try {
                await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000));
                const block = await retry(
                  async () => withTimeout(provider.getBlock(blockNumber), { milliseconds: 15000 }),
                  // FIX: adjust
                  {
                    retries: 1,
                    minTimeout: 1000,
                    maxTimeout: 2000,
                  }
                );
                if (block) {
                  blockTimestamps[blockNumber] = Number(block.timestamp);
                  lastTimestamp = Number(block.timestamp);
                  lastBlockNumber = blockNumber;
                }
              } catch (error) {
                // this is going to timeout all the time
              }
            }
          }
        });
      const blockTimestampsList = Object.entries(blockTimestamps).map(([blockNumber, timestamp]) => ({
        blockNumber: Number(blockNumber),
        timestamp,
      }));
      await insertBlockTimestampEntries(chain, blockTimestampsList);
      console.log(`Completed processing for chain ${chain}: saved ${blockTimestampsList.length} timestamps`);
    })
  );

  console.log("Block timestamp processing complete");
};

export default wrapScheduledLambda(handler);
