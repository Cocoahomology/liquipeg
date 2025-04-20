import { IResponse, successResponse, errorResponse } from "../utils/lambda-response";
import { APIGatewayEvent } from "aws-lambda";
import wrap from "../utils/wrap";
import { getDailyPoolData } from "../db/read";
import { defaultStartTimestamp } from "../utils/constants";

// FIX: remove date field from poolDataByDay after testing is finished
export async function getPoolDataChart(
  protocolId: number,
  chain: string,
  troveManagerIndex?: number,
  startTimestamp?: number,
  endTimestamp?: number,
  replaceLastEntryWithHourly?: boolean
) {
  const rawData = await getDailyPoolData(
    protocolId,
    chain,
    troveManagerIndex,
    startTimestamp,
    endTimestamp,
    replaceLastEntryWithHourly
  );

  if (!rawData) return null;

  const { dates, poolData } = rawData;
  // Get priceData if available
  const priceData = "priceData" in rawData ? rawData.priceData : undefined;

  // Find min and max timestamps to ensure we have entries for all days
  let minTimestamp = Infinity;
  let maxTimestamp = 0;

  for (const dateInfo of dates) {
    if (dateInfo.timestamp < minTimestamp) minTimestamp = dateInfo.timestamp;
    if (dateInfo.timestamp > maxTimestamp) maxTimestamp = dateInfo.timestamp;
  }

  // Create an array of all daily timestamps in the range
  const allDailyTimestamps: number[] = [];
  if (minTimestamp !== Infinity && maxTimestamp !== 0) {
    for (let ts = minTimestamp; ts <= maxTimestamp; ts += 86400) {
      allDailyTimestamps.push(ts);
    }
  } else if (dates.length > 0) {
    allDailyTimestamps.push(...dates.map((d) => d.timestamp));
  }

  const poolDataByDay = allDailyTimestamps.map((timestamp) => {
    // Find the dateInfo for this timestamp if it exists
    const dateInfo = dates.find((d) => d.timestamp === timestamp);

    // If we have data for this timestamp, process it as before
    if (dateInfo && poolData[timestamp]) {
      const { date } = dateInfo;
      const rawPoolData = poolData[timestamp];

      // Clean the pool data by removing null/empty values
      const cleanedPoolData = Object.entries(rawPoolData).reduce((acc, [key, value]) => {
        // Skip empty objects, null values, and the timestamp field
        if (
          key === "timestamp" ||
          value === null ||
          (typeof value === "object" && value !== null && Object.keys(value).length === 0)
        ) {
          return acc;
        }
        acc[key] = value;
        return acc;
      }, {} as Record<string, any>);

      // Add price data if available for this timestamp
      const entryData: any = {
        date,
        timestamp,
        poolData: cleanedPoolData,
      };

      // Include price data if it exists for this timestamp
      if (priceData && priceData[timestamp]) {
        const rawPriceData = priceData[timestamp];
        const cleanedPriceData = Object.entries(rawPriceData).reduce((acc, [key, value]) => {
          // Skip empty objects, null values, and the timestamp field
          if (
            key === "timestamp" ||
            value === null ||
            (typeof value === "object" && value !== null && Object.keys(value).length === 0)
          ) {
            return acc;
          }
          acc[key] = value;
          return acc;
        }, {} as Record<string, any>);

        entryData.priceData = cleanedPriceData;
      }

      return entryData;
    }

    // For missing timestamps, create a placeholder entry with null values
    return {
      date: new Date(timestamp * 1000).toISOString().split("T")[0], // Format as YYYY-MM-DD
      timestamp,
      poolData: {},
      priceData: {},
    };
  });

  return {
    protocolId: rawData.protocolId,
    chain: rawData.chain,
    troveManagerIndex: troveManagerIndex ?? null,
    poolDataByDay,
  };
}

const handler = async (event: AWSLambda.APIGatewayEvent): Promise<IResponse> => {
  const protocolId = parseInt(event.pathParameters?.protocolId ?? "0");
  const chain = event.pathParameters?.chain;
  const troveManagerIndexParam = event.queryStringParameters?.troveManagerIndex;
  const troveManagerIndex =
    troveManagerIndexParam !== undefined
      ? isNaN(parseInt(troveManagerIndexParam))
        ? undefined
        : parseInt(troveManagerIndexParam)
      : undefined;
  if (!(typeof protocolId === "number") || protocolId === 0 || !chain) {
    return errorResponse({
      message: "protocolId and chain must be provided as path parameters",
    });
  }

  let startTimestamp = defaultStartTimestamp;
  if (event.queryStringParameters?.starttimestamp) {
    const parsedStartTimestamp = parseInt(event.queryStringParameters.starttimestamp);
    if (!isNaN(parsedStartTimestamp)) {
      startTimestamp = parsedStartTimestamp;
    }
  }
  let endTimestamp: number | undefined = undefined;
  if (event.queryStringParameters?.endtimestamp) {
    const parsedEndTimestamp = parseInt(event.queryStringParameters.endtimestamp);
    if (!isNaN(parsedEndTimestamp)) {
      endTimestamp = parsedEndTimestamp;
    }
  }

  const response =
    (await getPoolDataChart(protocolId, chain, troveManagerIndex, startTimestamp, endTimestamp, true)) ?? [];
  return successResponse(response, 10 * 60); // 10 mins cache
};

export default wrap(handler);
