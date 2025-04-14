import { IResponse, successResponse, errorResponse } from "../utils/lambda-response";
import { APIGatewayEvent } from "aws-lambda";
import wrap from "../utils/wrap";
import {
  getLatestTroveDataEntries,
  getLatestPricesAndRates,
  getLatestPoolDataEntries,
  getTroveManagersForProtocol,
} from "../db/read";

export async function getLatestTroveData(protocolId: number, chain: string, attachPoolData?: boolean) {
  const troveManagers = await getTroveManagersForProtocol(protocolId, chain);

  if (!troveManagers || troveManagers.length === 0) {
    return null;
  }

  const allTroveData = [];
  const pricesAndRatesByManager = new Map();
  const poolDataByManager = new Map();

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

    if (attachPoolData) {
      const poolData = await getLatestPoolDataEntries(protocolId, chain, troveManagerIndex);
      if (poolData?.collateralPoolData && poolData.collateralPoolData.length > 0) {
        const managerPoolData = poolData.collateralPoolData.find(
          (data) => data.troveManagerIndex === troveManagerIndex
        );

        if (managerPoolData) {
          poolDataByManager.set(troveManagerIndex, managerPoolData);
        } else {
          poolDataByManager.set(troveManagerIndex, null);
        }
      } else {
        poolDataByManager.set(troveManagerIndex, null);
      }
    }
  }

  for (const manager of troveManagers) {
    const troveManagerIndex = manager.troveManagerIndex;

    const troveData = await getLatestTroveDataEntries(protocolId, chain, troveManagerIndex);
    if (troveData) {
      const enhancedTroveData = troveData.map((entry) => {
        const enhancedEntry: any = {
          ...entry,
          pricesAndRates: pricesAndRatesByManager.get(troveManagerIndex),
        };

        if (attachPoolData) {
          enhancedEntry.poolData = poolDataByManager.get(troveManagerIndex);
        }

        return enhancedEntry;
      });
      allTroveData.push(...enhancedTroveData);
    }
  }

  return allTroveData;
}

const handler = async (event: AWSLambda.APIGatewayEvent): Promise<IResponse> => {
  const protocolId = parseInt(event.pathParameters?.protocolId ?? "0");
  const chain = event.pathParameters?.chain;
  const attachPoolData = event.queryStringParameters?.attachPoolData === "true";

  if (!(typeof protocolId === "number") || protocolId === 0 || !chain) {
    return errorResponse({
      message: "protocolId and chain must be provided as path parameters",
    });
  }
  const response = (await getLatestTroveData(protocolId, chain, attachPoolData)) ?? [];
  return successResponse(response, 10 * 60); // 10 mins cache
};

export default wrap(handler);
