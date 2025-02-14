const bunyan = require("bunyan");
import { Stream } from "bunyan";
import Logger from "bunyan";
import dotenv from "dotenv";
import path from "path";
const bunyanPostgresStream = require("bunyan-postgres-stream");

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type PostgresStream = Stream & {
  end: (callback: () => void) => void;
};

let stream: PostgresStream | null = null;
let logger: Logger | null = null;

const createErrorLogger = () => {
  if (!stream) {
    stream = bunyanPostgresStream({
      connection: {
        host: "liquipeg-pgdb-instance-1.cjiuck2sueaz.ap-east-1.rds.amazonaws.com",
        user: "pgmaster",
        password: process.env.PSQL_PW,
        database: "liquipeg_pgdb",
        port: 5432,
        ssl: {
          rejectUnauthorized: false,
        },
      },
      tableName: "logs",
    });
  }
  logger = bunyan.createLogger({
    name: "pg stream",
    level: "error",
    stream,
  }) as Logger;
  return logger;
};

const closeLogStream = async () => {
  if (stream?.end) {
    await new Promise<void>((resolve) => {
      stream?.end(() => {
        stream = null;
        logger = null;
        resolve();
      });
    });
  }
};

export class ErrorLoggerService {
  private static instance: ErrorLoggerService;
  private logger: Logger | null = null;

  private constructor() {}

  public static getInstance(): ErrorLoggerService {
    if (!ErrorLoggerService.instance) {
      ErrorLoggerService.instance = new ErrorLoggerService();
    }
    return ErrorLoggerService.instance;
  }

  public initLogger() {
    if (!this.logger) {
      this.logger = createErrorLogger();
    }
    return this.logger;
  }

  public async closeLogger() {
    await closeLogStream();
    this.logger = null;
  }

  public error(params: {
    error: string;
    keyword: "timeout" | "missingValues" | "critical" | "missingBlocks";
    table?: string;
    chain?: string;
    protocolId?: number;
  }) {
    if (!this.logger) {
      this.logger = this.initLogger();
    }
    this.logger.error(params);
  }
}
