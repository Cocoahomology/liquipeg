import { lookupBlock } from "@defillama/sdk/build/util";
import { importProtocol } from "../data/importProtocol";
import { wait } from "../utils/etherscan";
import { runTroveOperationsHistorical } from "../utils/adapter";
import { PromisePool } from "@supercharge/promise-pool";

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

  const { results, errors } = await PromisePool.for(protocolData.chains).process(async (chain, i) => {
    console.log(`Running adapter for ${chain} for ${protocolData.protocolDbName}`);
    await wait(500 * i);
    const startBlock = (await lookupBlock(startTimestamp, { chain: chain })).number;
    const endBlock = (await lookupBlock(endTimestamp, { chain: chain })).number;

    try {
      await runTroveOperationsHistorical(startBlock, endBlock, protocolData, chain, {
        allowNullDbValues: false,
        onConflict: "ignore",
      });
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

  console.log(`Finished running adapter from ${startTimestamp} to ${endTimestamp} for ${protocolData.protocolDbName}`);
  return { success: true, failedChains: results.filter((r) => !r.success).map((r) => r.chain) };
}

(async () => {
  const result = await fillAdapterHistorical(startTimestamp, endTimestamp, undefined, protocolId);
  if (!result.success) {
    process.exit(1);
  }
})();
