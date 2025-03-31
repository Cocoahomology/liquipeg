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

  const poolDataByDay = dates
    .filter((dateInfo) => poolData[dateInfo.timestamp] !== undefined) // Filter out dates with no pool data
    .map((dateInfo) => {
      const { date, timestamp } = dateInfo;
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
