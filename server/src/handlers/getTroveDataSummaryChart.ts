import { IResponse, successResponse, errorResponse } from "../utils/lambda-response";
import { APIGatewayEvent } from "aws-lambda";
import wrap from "../utils/wrap";
import { getDailyTroveDataSummaries } from "../db/read";
import { defaultStartTimestamp } from "../utils/constants";

export async function getTroveDataSummaryChart(
  protocolId: number,
  chain: string,
  troveManagerIndex: number,
  startTimestamp?: number,
  endTimestamp?: number,
  replaceLastEntryWithHourly?: boolean
) {
  const rawData = await getDailyTroveDataSummaries(
    protocolId,
    chain,
    troveManagerIndex,
    startTimestamp,
    endTimestamp,
    replaceLastEntryWithHourly
  );

  if (!rawData) return null;

  const { dates, summaryData } = rawData;

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

  const troveDataByDay = allDailyTimestamps.map((timestamp) => {
    // Find the dateInfo for this timestamp if it exists
    const dateInfo = dates.find((d) => d.timestamp === timestamp);

    // If we have data for this timestamp, process it as before
    if (dateInfo && summaryData[timestamp]) {
      const rawTroveData = summaryData[timestamp];

      // Clean the trove data by removing null/empty values
      const cleanedTroveData = Object.entries(rawTroveData).reduce((acc, [key, value]) => {
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

      return {
        timestamp,
        troveData: cleanedTroveData,
      };
    }

    // For missing timestamps, create a placeholder entry with null values
    return {
      timestamp,
      troveData: {},
    };
  });

  return {
    protocolId: rawData.protocolId,
    chain: rawData.chain,
    troveManagerIndex: rawData.troveManagerIndex,
    troveDataSummaryByDay: troveDataByDay,
  };
}

const handler = async (event: AWSLambda.APIGatewayEvent): Promise<IResponse> => {
  const protocolIdParam = event.pathParameters?.protocolId;
  const chain = event.pathParameters?.chain;
  const troveManagerIndexParam = event.pathParameters?.troveManagerIndex;

  if (!protocolIdParam || !chain || !troveManagerIndexParam) {
    return errorResponse({
      message: "protocolId, chain, and troveManagerIndex must be provided as path parameters",
    });
  }
  const protocolId = parseInt(protocolIdParam);
  const troveManagerIndex = parseInt(troveManagerIndexParam);
  if (isNaN(protocolId) || protocolId <= 0 || isNaN(troveManagerIndex) || troveManagerIndex < 0) {
    return errorResponse({
      message: "protocolId and troveManagerIndex must be valid positive integers",
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
    (await getTroveDataSummaryChart(protocolId, chain, troveManagerIndex, startTimestamp, endTimestamp, true)) ?? [];
  return successResponse(response, 10 * 60); // 10 mins cache
};

export default wrap(handler);
