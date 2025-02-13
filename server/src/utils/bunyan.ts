const bunyan = require("bunyan");
import { Stream } from "bunyan";
import Logger from "bunyan";
const bunyanPostgresStream = require("./");
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type PostgresStream = Stream & {
  end: (callback: () => void) => void;
};

let stream: PostgresStream | null = null;
let logger: Logger | null = null;

export const createErrorLogger = () => {
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

    logger = bunyan.createLogger({
      name: "pg stream",
      level: "error",
      stream,
    });
  }
  return logger;
};

export const closeLogStream = async () => {
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
