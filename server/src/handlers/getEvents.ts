import { IResponse, successResponse, errorResponse } from "../utils/lambda-response";
import { APIGatewayEvent } from "aws-lambda";
import wrap from "../utils/wrap";
import { getEventsWithTimestamps } from "../db/read";

const operationsToFetch = [5, 6];

export async function getEvents(protocolId: number, chain: string, troveManagerIndex?: number) {
  const events = await getEventsWithTimestamps(protocolId, chain, operationsToFetch, undefined, troveManagerIndex);
  return events ?? [];
}

const handler = async (event: AWSLambda.APIGatewayEvent): Promise<IResponse> => {
  const protocolIdParam = event.pathParameters?.protocolId;
  const chain = event.pathParameters?.chain;
  const troveManagerIndexParam = event.queryStringParameters?.troveManagerIndex;

  if (!protocolIdParam || !chain) {
    return errorResponse({
      message: "protocolId and chain must be provided as path parameters",
    });
  }
  const protocolId = parseInt(protocolIdParam);
  if (isNaN(protocolId) || protocolId <= 0) {
    return errorResponse({
      message: "protocolId must be a valid positive integer",
    });
  }
  const troveManagerIndex = troveManagerIndexParam !== undefined ? parseInt(troveManagerIndexParam) : undefined;
  if (troveManagerIndexParam !== undefined && (isNaN(troveManagerIndex!) || troveManagerIndex! < 0)) {
    return errorResponse({
      message: "troveManagerIndex must be a valid positive integer",
    });
  }

  const response = await getEvents(protocolId, chain, troveManagerIndex);
  return successResponse(response, 10 * 60); // 10 mins cache
};

export default wrap(handler);
