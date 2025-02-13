import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    host: "liquipeg-pgdb-instance-1.cjiuck2sueaz.ap-east-1.rds.amazonaws.com",
    user: "pgmaster",
    password: process.env.PSQL_PW,
    database: "liquipeg_pgdb",
    port: 5432,
    ssl: {
      rejectUnauthorized: false, // You might need to adjust this based on your SSL configuration
    },
  },
});
