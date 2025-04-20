import db from "../db/db";
import { protocols } from "../db/schema";
import { eq } from "drizzle-orm";
import readline from "readline";

const protocolId = parseInt(process.argv[2]);
const chain = process.argv[3];

// Create readline interface for confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const deleteProtocol = async () => {
  // Validate input
  if (isNaN(protocolId) || protocolId <= 0) {
    console.error("Error: Please provide a valid protocol ID as the first argument");
    process.exit(1);
  }

  if (!chain) {
    console.error("Error: Please provide a chain as the second argument");
    process.exit(1);
  }

  // Check if protocol exists
  const protocol = await db.query.protocols.findFirst({
    where: (protocols) => eq(protocols.protocolId, protocolId) && eq(protocols.chain, chain),
  });

  if (!protocol) {
    console.error(`No protocol found with ID ${protocolId} on chain ${chain}`);
    process.exit(1);
  }

  console.log(`Found protocol: ${JSON.stringify(protocol, null, 2)}`);

  // Ask for confirmation
  rl.question(
    `Are you sure you want to delete protocol ${protocolId} on chain ${chain}? This will cascade to all related data. (yes/no): `,
    async (answer) => {
      if (answer.toLowerCase() !== "yes") {
        console.log("Operation cancelled.");
        rl.close();
        process.exit(0);
      }

      try {
        console.log(`Deleting protocol ${protocolId} on chain ${chain}...`);

        // Use a transaction to ensure data integrity
        await db.transaction(async (tx) => {
          const result = await tx
            .delete(protocols)
            .where(eq(protocols.protocolId, protocolId) && eq(protocols.chain, chain));

          console.log(`Deletion successful. Affected rows: ${result.rowCount}`);
        });

        console.log("Protocol and all related data deleted successfully.");
      } catch (error) {
        console.error("Error deleting protocol:", error);
      } finally {
        rl.close();
      }
    }
  );
};

(async () => {
  if (!protocolId || !chain) {
    console.log("Usage: ts-node deleteProtocol.ts <protocolId> <chain>");
    console.log("Example: ts-node deleteProtocol.ts 1 ethereum");
    process.exit(1);
  }

  await deleteProtocol();
})();
