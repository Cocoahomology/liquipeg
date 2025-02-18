import { drizzle } from "drizzle-orm/node-postgres";
import dotenv from "dotenv";
import path from "path";
import * as schema from "./schema";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const db = drizzle({
  casing: "snake_case",
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
  schema: schema,
});

export default db;
