import { IResponse, successResponse, errorResponse } from "../utils/lambda-response";
import { APIGatewayEvent } from "aws-lambda";
import wrap from "../utils/wrap";
import { getProtocolDetails } from "../db/read";
import protocolData from "../data/protocolData";

export async function getAllProtocolDetails(protocolId?: number) {
  const results = [];

  const protocolsToProcess =
    protocolId !== undefined ? protocolData.filter((protocol) => protocol.id === protocolId) : protocolData;

  for (const protocol of protocolsToProcess) {
    const protocolDetails = await getProtocolDetails(protocol.id);

    if (protocolDetails) {
      const { displayName, iconLink, url } = protocol;

      const combinedData = {
        ...protocolDetails,
        displayName,
        iconLink,
        url,
      };

      results.push(combinedData);
    }
  }

  return results;
}

const handler = async (event: AWSLambda.APIGatewayEvent): Promise<IResponse> => {
  const protocolIdParam = event.queryStringParameters?.protocolId;
  const protocolId = protocolIdParam !== undefined ? parseInt(protocolIdParam) : undefined;
  if (protocolIdParam !== undefined && (isNaN(protocolId!) || protocolId! < 0)) {
    return errorResponse({
      message: "protocolId must be a valid positive integer",
    });
  }
  const response = (await getAllProtocolDetails(protocolId)) ?? [];
  return successResponse(response, 10 * 60); // 10 mins cache
};

export default wrap(handler);
