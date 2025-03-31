import { IResponse, successResponse, errorResponse } from "../utils/lambda-response";
import { APIGatewayEvent } from "aws-lambda";
import wrap from "../utils/wrap";
import { getLatestTroveDataEntries, getLatestPricesAndRates, getTroveManagersForProtocol } from "../db/read";

export async function getLatestTroveData(protocolId: number, chain: string) {
  const troveManagers = await getTroveManagersForProtocol(protocolId, chain);

  if (!troveManagers || troveManagers.length === 0) {
    return null;
  }

  const allTroveData = [];
  const pricesAndRatesByManager = new Map();

  for (const manager of troveManagers) {
    const troveManagerIndex = manager.troveManagerIndex;

    const pricesAndRates = await getLatestPricesAndRates(protocolId, chain, troveManagerIndex);
    if (pricesAndRates?.pricesAndRatesData?.[0]) {
      const {
        timestamp,
        blockNumber,
        colUSDPriceFeed,
        colUSDOracle,
        LSTUnderlyingCanonicalRate,
        LSTUnderlyingMarketRate,
        underlyingUSDOracle,
      } = pricesAndRates.pricesAndRatesData[0];

      pricesAndRatesByManager.set(troveManagerIndex, {
        timestamp,
        blockNumber,
        colUSDPriceFeed,
        colUSDOracle,
        LSTUnderlyingCanonicalRate,
        LSTUnderlyingMarketRate,
        underlyingUSDOracle,
      });
    } else {
      pricesAndRatesByManager.set(troveManagerIndex, null);
    }
  }

  for (const manager of troveManagers) {
    const troveManagerIndex = manager.troveManagerIndex;

    const troveData = await getLatestTroveDataEntries(protocolId, chain, troveManagerIndex);
    if (troveData) {
      const enhancedTroveData = troveData.map((entry) => ({
        ...entry,
        pricesAndRates: pricesAndRatesByManager.get(troveManagerIndex),
      }));
      allTroveData.push(...enhancedTroveData);
    }
  }

  return allTroveData;
}

const handler = async (event: AWSLambda.APIGatewayEvent): Promise<IResponse> => {
  const protocolId = parseInt(event.pathParameters?.protocolId ?? "0");
  const chain = event.pathParameters?.chain;
  if (!(typeof protocolId === "number") || protocolId === 0 || !chain) {
    return errorResponse({
      message: "protocolId and chain must be provided as path parameters",
    });
  }
  const response = (await getLatestTroveData(protocolId, chain)) ?? [];
  return successResponse(response, 10 * 60); // 10 mins cache
};

export default wrap(handler);
