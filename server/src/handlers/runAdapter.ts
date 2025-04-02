import { wrapScheduledLambda } from "../utils/wrap";
import protocols from "../data/protocolData";
import { runAdapterToCurrentBlock } from "../utils/adapter";
import { ErrorLoggerService } from "../utils/bunyan";

const handler = async (event: any) => {
  const logger = ErrorLoggerService.getInstance();
  logger.initLogger();
  try {
    await runAdapterToCurrentBlock(
      protocols[event.protocolIndex],
      { allowNullDbValues: false, onConflict: "update" },
      event.updateImmutables
    );
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      keyword: "critical",
      protocolId: event.protocolIndex,
    });
    throw error;
  } finally {
    await logger.closeLogger();
  }
};

export default wrapScheduledLambda(handler);
