import { IResponse, successResponse, errorResponse } from "../utils/lambda-response";
import { APIGatewayEvent } from "aws-lambda";
import wrap from "../utils/wrap";
import { getProtocolDetails } from "../db/read";
import protocolData from "../data/protocolData";

export async function getAllProtocolDetails() {
  const results = [];

  for (const protocol of protocolData) {
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

const handler = async (_event: AWSLambda.APIGatewayEvent): Promise<IResponse> => {
  const response = (await getAllProtocolDetails()) ?? [];
  return successResponse(response, 10 * 60); // 10 mins cache
};

export default wrap(handler);
