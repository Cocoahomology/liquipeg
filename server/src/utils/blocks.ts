import { getLatestBlock } from "@defillama/sdk/build/util";
import { Block } from "@defillama/sdk/build/util/blocks";
import { withTimeout } from "./async";
import { ErrorLoggerService } from "./bunyan";
import retry from "async-retry";

export async function getLatestBlockWithLogging(
  chain: string,
  logger: ErrorLoggerService,
  idForLogging?: number,
  tableForLogging?: string
): Promise<Block> {
  try {
    const block = await retry(async () => withTimeout(getLatestBlock(chain), { milliseconds: 30000 }), {
      retries: 1,
    });
    return block;
  } catch (error) {
    const logData: any = {
      error: error instanceof Error ? error.message : String(error),
      keyword: "missingBlocks",
      chain,
    };
    if (tableForLogging) {
      logData.table = tableForLogging;
    }
    if (idForLogging) {
      logData.protocolId = idForLogging;
    }
    logger.error(logData);
    throw error;
  }
}
