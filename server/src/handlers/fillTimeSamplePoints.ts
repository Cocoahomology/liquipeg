import * as sdk from "@defillama/sdk";
import retry from "async-retry";
import { withTimeout } from "../utils/async";
import { and, eq, gt, sql } from "drizzle-orm";
import db from "../db/db";
import { protocols, troveManagers, corePoolData, colPoolData, pricesAndRates } from "../db/schema";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfHour } from "../utils/date";
import { insertSamplePointEntries } from "../db/write";
import { ErrorLoggerService } from "../utils/bunyan";

async function findClosestGtBlockEntry(table: any, targetBlock: number, filterCondition: any) {
  const logger = ErrorLoggerService.getInstance();
  try {
    const [result] = await db
      .select({
        blockNumber: table.blockNumber,
      })
      .from(table)
      .where(and(filterCondition, gt(table.blockNumber, targetBlock)))
      .orderBy(sql`ABS(${table.blockNumber} - ${targetBlock})`)
      .limit(1);

    return result?.blockNumber as number | undefined;
  } catch (error) {
    logger.error({
      error: `Failed to find closest block entry: ${error}`,
      keyword: "missingValues",
      function: "findClosestGtBlockEntry",
    });
    throw error;
  }
}

// FIX: move to write, make into handler
export async function fillTimeSamplePoints(targetTimestamp: number, hourly: boolean = false) {
  const logger = ErrorLoggerService.getInstance();
  try {
    // Determine timestamp and hour based on whether we want daily or hourly sample points
    const startTimestamp = !hourly
      ? getTimestampAtStartOfDayUTC(targetTimestamp)
      : getTimestampAtStartOfHour(targetTimestamp);

    // For hourly samples, we need to calculate the hour (0-23)
    const hour = !hourly ? 0 : new Date(targetTimestamp * 1000).getUTCHours();

    // Get all protocols and their chains
    const protocolEntries = await db
      .select({
        pk: protocols.pk,
        chain: protocols.chain,
      })
      .from(protocols);

    // Get all trove managers and their chains via protocols
    const troveManagerEntries = await db
      .select({
        pk: troveManagers.pk,
        chain: protocols.chain,
      })
      .from(troveManagers)
      .innerJoin(protocols, eq(troveManagers.protocolPk, protocols.pk));

    const samplePoints = [];

    // Process protocols
    for (const { pk: protocolPk, chain } of protocolEntries) {
      try {
        const keyBlock = await retry(
          async () => withTimeout(sdk.blocks.getBlock(chain, startTimestamp), { milliseconds: 15000 }),
          {
            retries: 1,
            minTimeout: 1000,
            maxTimeout: 2000,
          }
        );
        const keyBlockNumber = keyBlock.number;
        // Find closest core pool data
        const corePoolDataBlockNumber = await findClosestGtBlockEntry(
          corePoolData,
          keyBlockNumber,
          eq(corePoolData.protocolPk, protocolPk)
        );

        const provider = await sdk.getProvider(chain);
        const corePoolDataBlock =
          corePoolDataBlockNumber !== undefined
            ? await retry(
                async () => withTimeout(provider.getBlock(corePoolDataBlockNumber), { milliseconds: 15000 }),
                {
                  retries: 1,
                  minTimeout: 1000,
                  maxTimeout: 2000,
                }
              )
            : null;

        // Determine the valid time range - for daily it's 24h, for hourly it's 1h
        const endTimestamp = !hourly ? startTimestamp + 24 * 60 * 60 : startTimestamp + 60 * 60;

        if (corePoolDataBlock && corePoolDataBlock.timestamp && corePoolDataBlock.timestamp < endTimestamp) {
          samplePoints.push({
            date: new Date(startTimestamp * 1000),
            hour: hour,
            targetTimestamp: startTimestamp,
            protocolPk,
            corePoolDataBlockNumber: corePoolDataBlock.number ?? undefined,
          });
        }
      } catch (error) {
        const errString = `Failed to process protocol ${protocolPk} on chain ${chain}: ${error}`;
        console.error(errString);
        logger.error({
          error: errString,
          keyword: "missingValues",
          function: "fillTimeSamplePoints",
          chain,
        });
        continue; // Skip this protocol but continue with others
      }
    }

    // Process trove managers
    for (const { pk: troveManagerPk, chain } of troveManagerEntries) {
      try {
        const keyBlock = await retry(
          async () => withTimeout(sdk.blocks.getBlock(chain, startTimestamp), { milliseconds: 15000 }),
          {
            retries: 1,
            minTimeout: 1000,
            maxTimeout: 2000,
          }
        );

        const keyBlockNumber = keyBlock.number;

        const provider = await sdk.getProvider(chain);

        const [colPoolDataBlockNumber, pricesAndRatesBlockNumber] = await Promise.all([
          findClosestGtBlockEntry(colPoolData, keyBlockNumber, eq(colPoolData.troveManagerPk, troveManagerPk)),
          findClosestGtBlockEntry(pricesAndRates, keyBlockNumber, eq(pricesAndRates.troveManagerPk, troveManagerPk)),
        ]);

        const [colPoolDataBlock, pricesAndRatesBlock] = await Promise.all([
          colPoolDataBlockNumber
            ? retry(async () => withTimeout(provider.getBlock(colPoolDataBlockNumber), { milliseconds: 15000 }), {
                retries: 1,
                minTimeout: 1000,
                maxTimeout: 2000,
              })
            : null,
          pricesAndRatesBlockNumber
            ? retry(async () => withTimeout(provider.getBlock(pricesAndRatesBlockNumber), { milliseconds: 15000 }), {
                retries: 1,
                minTimeout: 1000,
                maxTimeout: 2000,
              })
            : null,
        ]);

        // Determine the valid time range - for daily it's 24h, for hourly it's 1h
        const endTimestamp = !hourly ? startTimestamp + 24 * 60 * 60 : startTimestamp + 60 * 60;

        const validBlocks = {
          colPoolDataBlock:
            colPoolDataBlock?.timestamp && colPoolDataBlock.timestamp < endTimestamp ? colPoolDataBlockNumber : null,
          pricesAndRatesBlock:
            pricesAndRatesBlock?.timestamp && pricesAndRatesBlock.timestamp < endTimestamp
              ? pricesAndRatesBlockNumber
              : null,
        };

        if (validBlocks.colPoolDataBlock || validBlocks.pricesAndRatesBlock) {
          samplePoints.push({
            date: new Date(startTimestamp * 1000),
            hour: hour,
            targetTimestamp: startTimestamp,
            troveManagerPk,
            colPoolDataBlockNumber: validBlocks.colPoolDataBlock ?? undefined,
            pricesAndRatesBlockNumber: validBlocks.pricesAndRatesBlock ?? undefined,
          });
        }
      } catch (error) {
        const errString = `Failed to process trove manager ${troveManagerPk} on chain ${chain}: ${error}`;
        console.error(errString);
        logger.error({
          error: errString,
          keyword: "missingValues",
          function: "fillTimeSamplePoints",
          chain,
        });
        continue; // Skip this trove manager but continue with others
      }
    }

    // Insert all sample points
    await insertSamplePointEntries(samplePoints, { onConflict: "update" });
  } catch (error) {
    const errString = `Failed to fill time sample points: ${error}`;
    console.error(errString);
    logger.error({
      error: errString,
      keyword: "missingValues",
      function: "fillTimeSamplePoints",
    });
    throw error;
  }
}
