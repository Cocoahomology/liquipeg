import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { and, eq, lt, gt, gte, lte, sql, Param } from "drizzle-orm";
import db from "../db/db";
import {
  protocols,
  troveManagers,
  troveData,
  troveManagerTimeSamplePoints,
  coreColImmutables,
  pricesAndRates,
  blockTimestamps,
} from "../db/schema";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfHour } from "../utils/date";
import { insertHourlyTroveDataSummaryEntries } from "../db/write";
import { ErrorLoggerService } from "../utils/bunyan";
import { HourlyTroveDataSummaryEntry } from "../utils/types";
import { timeStamp } from "console";

// FIX: move to write, make into handler
export async function fillHourlyTroveDataSummary(
  protocolId: number,
  chain: string,
  troveManagerIndex: number,
  targetTimestamp: number,
  hourly: boolean = false
) {
  const logger = ErrorLoggerService.getInstance();
  try {
    // Determine timestamp and hour based on whether we want daily or hourly sample points
    const startTimestamp = !hourly
      ? getTimestampAtStartOfDayUTC(targetTimestamp)
      : getTimestampAtStartOfHour(targetTimestamp);

    // For hourly samples, we need to calculate the hour (0-23)
    const hour = !hourly ? 0 : new Date(targetTimestamp * 1000).getUTCHours();
    const date = new Date(startTimestamp * 1000);

    // Get protocol and trove manager PKs
    const protocol = await db.query.protocols.findFirst({
      where: and(eq(protocols.protocolId, protocolId), eq(protocols.chain, chain)),
    });

    if (!protocol) {
      throw new Error(`Protocol not found: ${protocolId} on chain ${chain}`);
    }

    const troveMgr = await db.query.troveManagers.findFirst({
      where: and(eq(troveManagers.protocolPk, protocol.pk), eq(troveManagers.troveManagerIndex, troveManagerIndex)),
    });

    if (!troveMgr) {
      throw new Error(
        `Trove manager not found: index ${troveManagerIndex} for protocol ${protocolId} on chain ${chain}`
      );
    }

    // Find the troveManagerTimeSamplePoints entry with targetTimestamp closest to startTimestamp
    const samplePoints = await db.query.troveManagerTimeSamplePoints.findMany({
      where: eq(troveManagerTimeSamplePoints.troveManagerPk, troveMgr.pk),
    });

    if (!samplePoints.length) {
      const errString = `No sample points found for trove manager ${troveManagerIndex} for protocol ${protocolId} on chain ${chain}`;
      console.log(errString);
      logger.error({
        error: errString,
        keyword: "missingValues",
        function: "fillHourlyTroveDataSummary",
        chain,
        protocolId,
      });
      return;
    }

    // Find the closest sample point to startTimestamp
    let closestSamplePoint = samplePoints[0];
    let minDiff = Math.abs(closestSamplePoint.targetTimestamp - startTimestamp);

    for (let i = 1; i < samplePoints.length; i++) {
      const diff = Math.abs(samplePoints[i].targetTimestamp - startTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestSamplePoint = samplePoints[i];
      }
    }

    // Check if the closest sample point is too far from startTimestamp
    const timeDiffInHours = minDiff / 3600; // Convert seconds to hours
    let avgColRatio = null;

    if (timeDiffInHours > 1) {
      const errString = `Closest sample point timestamp (${closestSamplePoint.targetTimestamp}) is more than 1 hour away from target timestamp (${startTimestamp})`;
      console.log(errString);
      logger.error({
        error: errString,
        keyword: "missingValues",
        function: "fillHourlyTroveDataSummary",
        chain,
        protocolId,
      });

      if (timeDiffInHours > 24) {
        const criticalErrString = `Closest sample point timestamp (${closestSamplePoint.targetTimestamp}) is more than 24 hours away from target timestamp (${startTimestamp})`;
        console.log(criticalErrString);
        logger.error({
          error: criticalErrString,
          keyword: "missingValues",
          function: "fillHourlyTroveDataSummary",
          chain,
          protocolId,
        });
        // We'll keep avgColRatio as null since the timestamp disparity is too large
      }
    }

    // Find all blocks within 24 hours of the target timestamp
    const blockTimestampRows = await db
      .select({
        blockNumber: blockTimestamps.blockNumber,
        timestamp: blockTimestamps.timestamp,
      })
      .from(blockTimestamps)
      .where(
        and(
          eq(blockTimestamps.chain, chain),
          gte(blockTimestamps.timestamp, startTimestamp - 24 * 3600),
          lt(blockTimestamps.timestamp, startTimestamp + 24 * 3600)
        )
      )
      .orderBy(blockTimestamps.timestamp);

    if (!blockTimestampRows.length) {
      const errString = `No blocks found in the timestamp range for fillHourlyTroveDataSummary for protocolId ${protocolId}, ts ${targetTimestamp}`;
      console.log(errString);
      logger.error({
        error: errString,
        keyword: "missingValues",
        function: "fillHourlyTroveDataSummary",
        chain,
        protocolId,
      });
      return;
    }

    // Get block numbers and create a lookup for timestamp by block
    const blockNumbers = blockTimestampRows.map((row) => row.blockNumber);
    const timestampByBlock: Record<number, number> = {};
    blockTimestampRows.forEach((row) => {
      if (row.timestamp !== null) {
        timestampByBlock[row.blockNumber] = row.timestamp;
      }
    });

    // Get all trove data entries for these blocks
    const troveEntries = await db
      .select()
      .from(troveData)
      .where(
        and(eq(troveData.troveManagerPk, troveMgr.pk), sql`${troveData.blockNumber} = ANY(${new Param(blockNumbers)})`)
      );

    console.log(timestampByBlock);
    console.log(troveEntries);

    if (!troveEntries.length) {
      const errString = `No trove data found for the blocks in the timestamp range for protocolId ${protocolId}, ts ${targetTimestamp}`;
      console.log(errString);
      logger.error({
        error: errString,
        keyword: "missingValues",
        function: "fillHourlyTroveDataSummary",
        chain,
        protocolId,
      });
      return;
    }

    // Group by trove ID and find the closest entry to the start timestamp for each trove
    const trovesByTroveId: Record<string, any[]> = {};
    troveEntries.forEach((entry: any) => {
      if (!trovesByTroveId[entry.troveId]) {
        trovesByTroveId[entry.troveId] = [];
      }
      trovesByTroveId[entry.troveId].push(entry);
    });

    // For each trove ID, find the closest entry to the start timestamp
    const closestEntries: any[] = [];
    Object.keys(trovesByTroveId).forEach((troveId) => {
      const entries = trovesByTroveId[troveId];
      let closestEntry = entries[0];
      let minDiff = Math.abs(timestampByBlock[closestEntry.blockNumber] - startTimestamp);

      for (let i = 1; i < entries.length; i++) {
        const entry = entries[i];
        const blockTimestamp = timestampByBlock[entry.blockNumber];
        const diff = Math.abs(blockTimestamp - startTimestamp);

        if (diff < minDiff) {
          minDiff = diff;
          closestEntry = entry;
        }
      }

      closestEntries.push(closestEntry);
    });

    console.log(closestEntries);

    // Get coreColImmutables to retrieve collTokenDecimals
    const colImmutables = await db.query.coreColImmutables.findFirst({
      where: eq(coreColImmutables.troveManagerPk, troveMgr.pk),
    });

    if (!colImmutables) {
      const errString = `Could not find coreColImmutables for trove manager ${troveManagerIndex} for protocol ${protocolId} on chain ${chain}`;
      console.log(errString);
      logger.error({
        error: errString,
        keyword: "missingValues",
        function: "fillHourlyTroveDataSummary",
        chain,
        protocolId,
      });
      return;
    }

    const collTokenDecimals = parseInt(colImmutables.collTokenDecimals);

    // Get pricesAndRates using the pricesAndRatesBlockNumber from the closest sample point
    let colUSDPriceFeed = null;
    if (closestSamplePoint.pricesAndRatesBlockNumber) {
      const priceRates = await db.query.pricesAndRates.findFirst({
        where: and(
          eq(pricesAndRates.troveManagerPk, troveMgr.pk),
          eq(pricesAndRates.blockNumber, closestSamplePoint.pricesAndRatesBlockNumber)
        ),
      });

      if (priceRates) {
        colUSDPriceFeed = priceRates.colUSDPriceFeed;
      } else {
        const errString = `Could not find pricesAndRates for block ${closestSamplePoint.pricesAndRatesBlockNumber}`;
        console.log(errString);
        logger.error({
          error: errString,
          keyword: "missingValues",
          function: "fillHourlyTroveDataSummary",
          chain,
          protocolId,
        });
      }
    }

    // Calculate summary statistics
    const statusCounts: Record<string, number> = {};
    let totalInterestRate = 0;
    let nonZeroInterestRateCount = 0;
    let totalColRatio = 0;
    let nonZeroColRatioCount = 0;

    closestEntries.forEach((entry) => {
      const status = entry.status.toString();
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      const interestRate = parseFloat(entry.annualInterestRate);
      if (interestRate > 0) {
        totalInterestRate += interestRate;
        nonZeroInterestRateCount++;
      }

      // Calculate collateral ratio if possible
      if (colUSDPriceFeed && timeDiffInHours <= 24) {
        try {
          // Use native BigInt for handling large numbers
          //console.log(entry);
          const coll = BigInt(entry.coll);
          const entireDebt = BigInt(entry.entireDebt);
          if (entireDebt > 0n) {
            console.log("colUSDPriceFeed", colUSDPriceFeed);
            console.log("coll", coll.toString());
            console.log("debt", entireDebt.toString());
            console.log("collTokenDecimals", collTokenDecimals);

            // Parse colUSDPriceFeed as a float first, then convert to a fixed point representation
            const colUsdPriceFloat = parseFloat(colUSDPriceFeed);
            // Use a high precision multiplier (1e18) to preserve decimal places
            const PRICE_PRECISION = 10 ** 18;
            const colUsdPriceScaled = Math.round(colUsdPriceFloat * PRICE_PRECISION);

            // Calculate with scaled values
            const colUsdValue = (BigInt(colUsdPriceScaled) * coll) / BigInt(PRICE_PRECISION);
            const debtAdjusted = entireDebt * BigInt(10) ** BigInt(collTokenDecimals - 18);

            // Use Number conversion for final calculation (with potential precision loss for very large numbers)
            const colRatio = debtAdjusted === 0n ? 0 : (Number(colUsdValue) / Number(debtAdjusted)) * 100;

            console.log("colRatio", colRatio);
            if (!isNaN(colRatio) && isFinite(colRatio) && colRatio > 0.001) {
              // Avoid extremely small values
              totalColRatio += parseFloat(colRatio.toFixed(3));
              nonZeroColRatioCount++;
            }
          }
        } catch (e) {
          console.error(`Error calculating col ratio for trove ${entry.troveId}:`, e);
        }
      }
    });

    const avgInterestRate =
      nonZeroInterestRateCount > 0 ? (totalInterestRate / nonZeroInterestRateCount).toString() : "0";

    // Calculate average collateral ratio if we have enough data
    if (nonZeroColRatioCount > 0) {
      avgColRatio = (totalColRatio / nonZeroColRatioCount).toFixed(3);
    }

    const summaryEntry: HourlyTroveDataSummaryEntry = {
      protocolId,
      chain,
      troveManagerIndex,
      date: date,
      hour,
      targetTimestamp: startTimestamp,
      avgInterestRate,
      avgColRatio,
      statusCounts,
      totalTroves: closestEntries.length,
    };
    console.log(summaryEntry);

    //await insertHourlyTroveDataSummaryEntries([summaryEntry], { onConflict: "update" });
  } catch (error) {
    const errString = `Failed to fill hourly trove data summary: ${error}`;
    console.error(errString);
    logger.error({
      error: errString,
      keyword: "missingValues",
      function: "fillHourlyTroveDataSummary",
      chain,
      protocolId,
    });
    throw error;
  }
}
