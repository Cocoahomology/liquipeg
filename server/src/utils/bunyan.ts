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
    protocolId?: number;
  }): Promise<void> {
    if (!this.logger) {
      this.initLogger();
    }

    return new Promise((resolve, reject) => {
      this.logger!.error(params, (err: Error | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
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
