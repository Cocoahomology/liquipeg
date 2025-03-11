import { ErrorLoggerService } from "./bunyan";

const logger = ErrorLoggerService.getInstance();

type DbContext = {
  table?: string;
  chain?: string;
  protocolId?: number;
  function?: string;
};

export async function withDbError<T>(operation: () => Promise<T>, context: DbContext = {}): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.error({
      error: `Failed database operation: ${error}`,
      keyword: "critical",
      ...context,
    });
    throw error;
  }
}
