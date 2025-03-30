import * as sdk from "@defillama/sdk";
import retry from "async-retry";
import { withTimeout } from "../utils/async";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import db from "../db/db";
import { protocols, troveManagers, corePoolData, colPoolData, pricesAndRates } from "../db/schema";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfHour } from "../utils/date";
import { insertSamplePointEntries } from "../db/write";
import { ErrorLoggerService } from "../utils/bunyan";

async function findClosestGtBlockEntry(table: any, targetBlock: number, filterCondition: any) {
  const logger = ErrorLoggerService.getInstance();
  try {
    console.log(`Looking for closest block entry with target block ${targetBlock} (greater than)`);
    const [result] = await db
      .select({
        blockNumber: table.blockNumber,
      })
      .from(table)
      .where(and(filterCondition, gt(table.blockNumber, targetBlock)))
      .orderBy(sql`ABS(${table.blockNumber} - ${targetBlock})`)
      .limit(1);

    console.log(`Found closest block (greater than): ${result?.blockNumber || "none"}`);
    return result?.blockNumber as number | undefined;
  } catch (error) {
    logger.error({
      error: `Failed to find closest block entry (greater than): ${error}`,
      keyword: "missingValues",
      function: "findClosestGtBlockEntry",
    });
    throw error;
  }
}

async function findClosestLtBlockEntry(table: any, targetBlock: number, filterCondition: any) {
  const logger = ErrorLoggerService.getInstance();
  try {
    console.log(`Looking for closest block entry with target block ${targetBlock} (less than)`);
    const [result] = await db
      .select({
        blockNumber: table.blockNumber,
      })
      .from(table)
      .where(and(filterCondition, lt(table.blockNumber, targetBlock)))
      .orderBy(sql`ABS(${table.blockNumber} - ${targetBlock})`)
      .limit(1);

    console.log(`Found closest block (less than): ${result?.blockNumber || "none"}`);
    return result?.blockNumber as number | undefined;
  } catch (error) {
    logger.error({
      error: `Failed to find closest block entry (less than): ${error}`,
      keyword: "missingValues",
      function: "findClosestLtBlockEntry",
    });
    throw error;
  }
}

export async function fillTimeSamplePoints(targetTimestamp: number, hourly: boolean = false) {
  const logger = ErrorLoggerService.getInstance();
  try {
    console.log(`============================================`);
    console.log(
      `Starting fillTimeSamplePoints with target timestamp: ${targetTimestamp} (${new Date(
        targetTimestamp * 1000
      ).toISOString()})`
    );
    console.log(`Mode: ${hourly ? "Hourly" : "Daily"}`);

    const startTimestamp = !hourly
      ? getTimestampAtStartOfDayUTC(targetTimestamp)
      : getTimestampAtStartOfHour(targetTimestamp);

    const hour = !hourly ? 0 : new Date(targetTimestamp * 1000).getUTCHours();

    console.log(`Calculated startTimestamp: ${startTimestamp} (${new Date(startTimestamp * 1000).toISOString()})`);
    console.log(`Hour: ${hour}`);

    const protocolEntries = await db
      .select({
        pk: protocols.pk,
        chain: protocols.chain,
      })
      .from(protocols);

    console.log(`Found ${protocolEntries.length} protocols to process`);

    const troveManagerEntries = await db
      .select({
        pk: troveManagers.pk,
        chain: protocols.chain,
      })
      .from(troveManagers)
      .innerJoin(protocols, eq(troveManagers.protocolPk, protocols.pk));

    console.log(`Found ${troveManagerEntries.length} trove managers to process`);

    const samplePoints = [];

    console.log(`Beginning protocol processing...`);
    for (const [index, { pk: protocolPk, chain }] of protocolEntries.entries()) {
      try {
        console.log(`Processing protocol ${index + 1}/${protocolEntries.length}: PK=${protocolPk}, Chain=${chain}`);

        const keyBlock = await retry(
          async () => withTimeout(sdk.blocks.getBlock(chain, startTimestamp), { milliseconds: 15000 }),
          {
            retries: 1,
            minTimeout: 1000,
            maxTimeout: 2000,
          }
        );
        const keyBlockNumber = keyBlock.number;
        console.log(`Found key block ${keyBlockNumber} for timestamp ${startTimestamp}`);

        console.log(`Finding closest core pool data block for protocol ${protocolPk}`);
        let corePoolDataBlockNumber = await findClosestGtBlockEntry(
          corePoolData,
          keyBlockNumber,
          eq(corePoolData.protocolPk, protocolPk)
        );

        const provider = await sdk.getProvider(chain);
        let corePoolDataBlockTimestamp;
        let corePoolDataBlock;
        let isValidBlock = false;

        const endTimestamp = !hourly ? startTimestamp + 24 * 60 * 60 : startTimestamp + 60 * 60;
        console.log(`Valid time range: ${startTimestamp} - ${endTimestamp}`);

        if (corePoolDataBlockNumber !== undefined) {
          corePoolDataBlock = await retry(
            async () => withTimeout(provider.getBlock(corePoolDataBlockNumber as number), { milliseconds: 15000 }),
            {
              retries: 1,
              minTimeout: 1000,
              maxTimeout: 2000,
            }
          );

          if (corePoolDataBlock) {
            corePoolDataBlockTimestamp = corePoolDataBlock.timestamp;
            console.log(
              `Core pool data block timestamp (greater than): ${corePoolDataBlockTimestamp} (${new Date(
                corePoolDataBlockTimestamp * 1000
              ).toISOString()})`
            );

            isValidBlock = corePoolDataBlock.timestamp < endTimestamp;
          }
        }

        if (!isValidBlock) {
          console.log(`No valid core pool data block found in greater than direction, trying less than direction`);

          corePoolDataBlockNumber = await findClosestLtBlockEntry(
            corePoolData,
            keyBlockNumber,
            eq(corePoolData.protocolPk, protocolPk)
          );

          if (corePoolDataBlockNumber !== undefined) {
            corePoolDataBlock = await retry(
              async () => withTimeout(provider.getBlock(corePoolDataBlockNumber as number), { milliseconds: 15000 }),
              {
                retries: 1,
                minTimeout: 1000,
                maxTimeout: 2000,
              }
            );

            if (corePoolDataBlock) {
              corePoolDataBlockTimestamp = corePoolDataBlock.timestamp;
              console.log(
                `Core pool data block timestamp (less than): ${corePoolDataBlockTimestamp} (${new Date(
                  corePoolDataBlockTimestamp * 1000
                ).toISOString()})`
              );

              const minTimestamp = !hourly ? startTimestamp - 24 * 60 * 60 : startTimestamp - 60 * 60;
              isValidBlock = corePoolDataBlock.timestamp >= minTimestamp;

              if (!isValidBlock) {
                console.log(`Block too old, outside valid time range of ${minTimestamp} - ${startTimestamp}`);
              }
            }
          }
        }

        if (!corePoolDataBlock) {
          console.log(`No core pool data block found in either direction`);
        }

        if (isValidBlock && corePoolDataBlock) {
          console.log(
            `Adding protocol sample point: date=${new Date(
              startTimestamp * 1000
            ).toISOString()}, protocolPk=${protocolPk}, blockNumber=${corePoolDataBlock.number}`
          );
          samplePoints.push({
            date: new Date(startTimestamp * 1000),
            hour: hour,
            targetTimestamp: startTimestamp,
            protocolPk,
            corePoolDataBlockNumber: corePoolDataBlock.number ?? undefined,
          });
        } else {
          console.log(`Skipping protocol sample point: no valid block found within time range`);
        }
      } catch (error) {
        const errString = `Failed to process protocol pk ${protocolPk} on chain ${chain}: ${error}`;
        console.error(errString);
        logger.error({
          error: errString,
          keyword: "missingValues",
          function: "fillTimeSamplePoints",
          chain,
        });
        continue;
      }
    }

    console.log(`Beginning trove manager processing...`);
    for (const [index, { pk: troveManagerPk, chain }] of troveManagerEntries.entries()) {
      try {
        console.log(
          `Processing trove manager ${index + 1}/${troveManagerEntries.length}: PK=${troveManagerPk}, Chain=${chain}`
        );

        const keyBlock = await retry(
          async () => withTimeout(sdk.blocks.getBlock(chain, startTimestamp), { milliseconds: 15000 }),
          {
            retries: 1,
            minTimeout: 1000,
            maxTimeout: 2000,
          }
        );

        const keyBlockNumber = keyBlock.number;
        console.log(`Found key block ${keyBlockNumber} for timestamp ${startTimestamp}`);

        const provider = await sdk.getProvider(chain);

        const endTimestamp = !hourly ? startTimestamp + 24 * 60 * 60 : startTimestamp + 60 * 60;
        const minTimestamp = !hourly ? startTimestamp - 24 * 60 * 60 : startTimestamp - 60 * 60;
        console.log(`Valid time range forward: ${startTimestamp} - ${endTimestamp}`);
        console.log(`Valid time range backward: ${minTimestamp} - ${startTimestamp}`);

        console.log(`Finding closest col pool data block for trove manager ${troveManagerPk} (greater than)`);
        let colPoolDataBlockNumber = await findClosestGtBlockEntry(
          colPoolData,
          keyBlockNumber,
          eq(colPoolData.troveManagerPk, troveManagerPk)
        );

        console.log(`Finding closest prices and rates block for trove manager ${troveManagerPk} (greater than)`);
        let pricesAndRatesBlockNumber = await findClosestGtBlockEntry(
          pricesAndRates,
          keyBlockNumber,
          eq(pricesAndRates.troveManagerPk, troveManagerPk)
        );

        let colPoolDataBlock, pricesAndRatesBlock;
        let colPoolDataBlockTimestamp, pricesAndRatesBlockTimestamp;
        let isValidColPoolBlock = false;
        let isValidPricesBlock = false;

        if (colPoolDataBlockNumber !== undefined) {
          colPoolDataBlock = await retry(
            async () => withTimeout(provider.getBlock(colPoolDataBlockNumber as number), { milliseconds: 15000 }),
            {
              retries: 1,
              minTimeout: 1000,
              maxTimeout: 2000,
            }
          );

          if (colPoolDataBlock) {
            colPoolDataBlockTimestamp = colPoolDataBlock.timestamp;
            isValidColPoolBlock = colPoolDataBlock.timestamp < endTimestamp;
            console.log(
              `Col pool data block timestamp (greater than): ${colPoolDataBlockTimestamp} (${new Date(
                colPoolDataBlockTimestamp * 1000
              ).toISOString()}) - ${isValidColPoolBlock ? "valid" : "invalid"}`
            );
          }
        }

        if (!isValidColPoolBlock) {
          console.log(`No valid col pool data block found in greater than direction, trying less than direction`);
          colPoolDataBlockNumber = await findClosestLtBlockEntry(
            colPoolData,
            keyBlockNumber,
            eq(colPoolData.troveManagerPk, troveManagerPk)
          );

          if (colPoolDataBlockNumber !== undefined) {
            colPoolDataBlock = await retry(
              async () => withTimeout(provider.getBlock(colPoolDataBlockNumber as number), { milliseconds: 15000 }),
              {
                retries: 1,
                minTimeout: 1000,
                maxTimeout: 2000,
              }
            );

            if (colPoolDataBlock) {
              colPoolDataBlockTimestamp = colPoolDataBlock.timestamp;
              isValidColPoolBlock = colPoolDataBlock.timestamp >= minTimestamp;
              console.log(
                `Col pool data block timestamp (less than): ${colPoolDataBlockTimestamp} (${new Date(
                  colPoolDataBlockTimestamp * 1000
                ).toISOString()}) - ${isValidColPoolBlock ? "valid" : "invalid"}`
              );
            }
          }
        }

        if (pricesAndRatesBlockNumber !== undefined) {
          pricesAndRatesBlock = await retry(
            async () => withTimeout(provider.getBlock(pricesAndRatesBlockNumber as number), { milliseconds: 15000 }),
            {
              retries: 1,
              minTimeout: 1000,
              maxTimeout: 2000,
            }
          );

          if (pricesAndRatesBlock) {
            pricesAndRatesBlockTimestamp = pricesAndRatesBlock.timestamp;
            isValidPricesBlock = pricesAndRatesBlock.timestamp < endTimestamp;
            console.log(
              `Prices and rates block timestamp (greater than): ${pricesAndRatesBlockTimestamp} (${new Date(
                pricesAndRatesBlockTimestamp * 1000
              ).toISOString()}) - ${isValidPricesBlock ? "valid" : "invalid"}`
            );
          }
        }

        if (!isValidPricesBlock) {
          console.log(`No valid prices and rates block found in greater than direction, trying less than direction`);
          pricesAndRatesBlockNumber = await findClosestLtBlockEntry(
            pricesAndRates,
            keyBlockNumber,
            eq(pricesAndRates.troveManagerPk, troveManagerPk)
          );

          if (pricesAndRatesBlockNumber !== undefined) {
            pricesAndRatesBlock = await retry(
              async () => withTimeout(provider.getBlock(pricesAndRatesBlockNumber as number), { milliseconds: 15000 }),
              {
                retries: 1,
                minTimeout: 1000,
                maxTimeout: 2000,
              }
            );

            if (pricesAndRatesBlock) {
              pricesAndRatesBlockTimestamp = pricesAndRatesBlock.timestamp;
              isValidPricesBlock = pricesAndRatesBlock.timestamp >= minTimestamp;
              console.log(
                `Prices and rates block timestamp (less than): ${pricesAndRatesBlockTimestamp} (${new Date(
                  pricesAndRatesBlockTimestamp * 1000
                ).toISOString()}) - ${isValidPricesBlock ? "valid" : "invalid"}`
              );
            }
          }
        }

        const validBlocks = {
          colPoolDataBlock: isValidColPoolBlock ? colPoolDataBlockNumber : null,
          pricesAndRatesBlock: isValidPricesBlock ? pricesAndRatesBlockNumber : null,
        };

        console.log(
          `Valid blocks - colPoolData: ${validBlocks.colPoolDataBlock || "none"}, pricesAndRates: ${
            validBlocks.pricesAndRatesBlock || "none"
          }`
        );

        if (validBlocks.colPoolDataBlock || validBlocks.pricesAndRatesBlock) {
          console.log(
            `Adding trove manager sample point: date=${new Date(
              startTimestamp * 1000
            ).toISOString()}, troveManagerPk=${troveManagerPk}`
          );
          samplePoints.push({
            date: new Date(startTimestamp * 1000),
            hour: hour,
            targetTimestamp: startTimestamp,
            troveManagerPk,
            colPoolDataBlockNumber: validBlocks.colPoolDataBlock ?? undefined,
            pricesAndRatesBlockNumber: validBlocks.pricesAndRatesBlock ?? undefined,
          });
        } else {
          console.log(`Skipping trove manager sample point: no valid blocks found within time range`);
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
        continue;
      }
    }

    console.log(`Total sample points collected: ${samplePoints.length}`);
    console.log(
      `Sample points breakdown: ${samplePoints.filter((sp) => sp.protocolPk).length} protocol points, ${
        samplePoints.filter((sp) => sp.troveManagerPk).length
      } trove manager points`
    );

    if (samplePoints.length > 0) {
      console.log(`Inserting ${samplePoints.length} sample points into database...`);
      await insertSamplePointEntries(samplePoints, { onConflict: "update" });
      console.log(`Successfully inserted sample points`);
    } else {
      console.log(`No sample points to insert`);
    }

    console.log(`Completed fillTimeSamplePoints successfully`);
    console.log(`============================================`);
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
