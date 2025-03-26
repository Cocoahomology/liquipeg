import { getProtocolDetails } from "../db/read";
import protocolData from "../data/protocolData";

// FIX: make into handler
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
