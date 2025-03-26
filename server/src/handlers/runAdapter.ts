import { wrapScheduledLambda } from "../utils/wrap";
import protocols from "../data/protocolData";
import { runAdapterToCurrentBlock } from "../utils/adapter";
import { createErrorLogger, closeLogStream } from "../utils/bunyan";

const handler = async (event: any) => {
  const errorLogger = createErrorLogger();
  await runAdapterToCurrentBlock(protocols[event.protocolIndex], false, "upsert", errorLogger);
  await closeLogStream;
};

export default wrapScheduledLambda(handler);
