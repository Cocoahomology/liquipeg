import { IResponse, successResponse, errorResponse } from "../utils/lambda-response";
import { APIGatewayEvent } from "aws-lambda";
import wrap from "../utils/wrap";
import { getDailyPricesAndRates } from "../db/read";
import { defaultStartTimestamp } from "../utils/constants";

// FIX: remove date field from priceDataByDay after testing is finished
export async function getPricesChart(
  protocolId: number,
  chain: string,
  troveManagerIndex: number,
  startTimestamp?: number,
  endTimestamp?: number,
  replaceLastEntryWithHourly?: boolean
) {
  const rawData = await getDailyPricesAndRates(
    protocolId,
    chain,
    troveManagerIndex,
    startTimestamp,
    endTimestamp,
    replaceLastEntryWithHourly
  );

  if (!rawData) return null;
  const { dates, priceData } = rawData;

  const priceDataByDay = dates
    .filter((dateInfo) => priceData[dateInfo.timestamp] !== undefined) // Filter out dates with no price data
    .map((dateInfo) => {
      const { date, timestamp } = dateInfo;
      const rawPriceData = priceData[timestamp];

      // Clean the price data by removing null/empty values
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

      return {
        date,
        timestamp,
        priceData: cleanedPriceData,
      };
    });

  return {
    protocolId: rawData.protocolId,
    chain: rawData.chain,
    troveManagerIndex: rawData.troveManagerIndex,
    priceDataByDay,
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
    (await getPricesChart(protocolId, chain, troveManagerIndex, startTimestamp, endTimestamp, true)) ?? [];
  return successResponse(response, 10 * 60); // 10 mins cache
};

export default wrap(handler);
