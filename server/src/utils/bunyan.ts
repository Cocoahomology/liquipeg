const bunyan = require("bunyan");
import { Stream } from "bunyan";
import Logger from "bunyan";
import dotenv from "dotenv";
import path from "path";
const bunyanPostgresStream = require("bunyan-postgres-stream");
import { withTimeout } from "./async";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type PostgresStream = Stream & {
  end: (callback: () => void) => void;
};

export class ErrorLoggerService {
  private static instance: ErrorLoggerService;
  private logger: Logger | null = null;
  private stream: PostgresStream | null = null;

  private constructor() {}

  public static getInstance(): ErrorLoggerService {
    if (!ErrorLoggerService.instance) {
      ErrorLoggerService.instance = new ErrorLoggerService();
    }
    return ErrorLoggerService.instance;
  }

  public initLogger() {
    if (!this.stream) {
      this.stream = bunyanPostgresStream({
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
        tableName: "error_logs",
      });
    }

    if (!this.logger) {
      this.logger = bunyan.createLogger({
        name: "pg stream",
        level: "error",
        streams: [
          {
            stream: this.stream,
          },
          {
            stream: process.stdout,
            level: "error",
          },
        ],
      }) as Logger;
    }
    return this.logger;
  }

  public error(params: {
    error: string;
    keyword: "timeout" | "missingValues" | "critical" | "missingBlocks";
    table?: string;
    chain?: string;
    function?: string;
    protocolId?: number;
  }): void {
    if (!this.logger) {
      this.initLogger();
    }

    // Get the caller's name using Error.stack
    const stack = new Error().stack;
    const caller = stack?.split("\n")[2]?.trim()?.split(" ")[1] || "unknown";

    new Promise<void>((resolve) => {
      this.logger!.error({ ...params, function: params.function || caller }, (err: Error | undefined) => {
        if (err) {
          console.error("Error writing to log:", err);
        }
        resolve();
      });
    });
  }

  public async closeLogger() {
    if (this.stream?.end) {
      await new Promise<void>((resolve) => {
        this.stream?.end(() => {
          this.stream = null;
          this.logger = null;
          resolve();
        });
      });
    }
  }
}
